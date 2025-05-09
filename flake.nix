{
  inputs = {
    holonix = {
      url = "github:holochain/holonix?ref=main-0.5";
    };

    nixpkgs.follows = "holonix/nixpkgs";

    # lib to build a nix package from a rust crate
    crane.follows = "holonix/crane";

    # Rust toolchain
    rust-overlay.follows = "holonix/rust-overlay";
  };

  outputs = inputs@{ nixpkgs, holonix, crane, rust-overlay, ... }:
    holonix.inputs.flake-parts.lib.mkFlake { inherit inputs; } {
      # provide a dev shell for all systems that the holonix flake supports
      systems = builtins.attrNames holonix.devShells;

      perSystem = { inputs', config, system, pkgs, lib, ... }:
        {
          formatter = pkgs.nixpkgs-fmt;

          devShells.default = pkgs.mkShell {
            packages = [
              # add packages from Holonix
              inputs'.holonix.packages.hc
              inputs'.holonix.packages.holochain
              inputs'.holonix.packages.lair-keystore
              inputs'.holonix.packages.rust
              inputs'.holonix.packages.bootstrap-srv

              # add further packages from nixpkgs
              pkgs.nodejs

              (lib.optional pkgs.stdenv.isDarwin [
                pkgs.libiconv
                pkgs.darwin.apple_sdk.frameworks.CoreFoundation
                pkgs.darwin.apple_sdk.frameworks.Security
                pkgs.darwin.apple_sdk.frameworks.SystemConfiguration
              ])
            ];

            shellHook = ''
              export PS1='\[\033[1;34m\][holonix:\w]\$\[\033[0m\] '
            '';
          };
        };
    };
}
