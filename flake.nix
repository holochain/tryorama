{
  inputs = {
    nixpkgs.follows = "holonix/nixpkgs";

    versions.url = "github:holochain/holochain?dir=versions/weekly";
    holonix.url = "github:holochain/holochain";
    holonix.inputs.versions.follows = "versions";

    # lib to build a nix package from a rust crate
    crane = {
      url = "github:ipetkov/crane";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    # Rust toolchain
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = inputs@{ nixpkgs, holonix, crane, rust-overlay, ... }:
    holonix.inputs.flake-parts.lib.mkFlake { inherit inputs; } {
      # provide a dev shell for all systems that the holonix flake supports
      systems = builtins.attrNames holonix.devShells;

      perSystem = { config, system, pkgs, lib, ... }:
        {
          formatter = pkgs.nixpkgs-fmt;

          devShells.default = pkgs.mkShell {
            inputsFrom = [ holonix.devShells.${system}.holochainBinaries ];
            packages = with pkgs; [
              # add further packages from nixpkgs
              nodejs
            ];
          };

          packages.trycp-server =
            let
              pkgs = import nixpkgs {
                inherit system;
                overlays = [ (import rust-overlay) ];
              };

              rustToolchain = pkgs.rust-bin.stable."1.78.0".minimal;

              craneLib = (crane.mkLib pkgs).overrideToolchain rustToolchain;

              crateInfo = craneLib.crateNameFromCargoToml { cargoToml = ./crates/trycp_server/Cargo.toml; };
            in
            craneLib.buildPackage {
              pname = "trycp-server";
              version = crateInfo.version;
              src = craneLib.cleanCargoSource (craneLib.path ./.);
              doCheck = false;

              buildInputs = [ ]
                ++ (lib.optionals pkgs.stdenv.isDarwin
                (with pkgs.darwin.apple_sdk_11_0.frameworks; [
                  CoreFoundation
                  Security
                ]));
            };
        };
    };
}
