{
  description = "Flake for Holochain app development with customized Holochain build";

  inputs = {
    holonix.url = "github:holochain/holonix?ref=main";

    nixpkgs.follows = "holonix/nixpkgs";
    flake-parts.follows = "holonix/flake-parts";
  };

  outputs = inputs@{ flake-parts, ... }: flake-parts.lib.mkFlake { inherit inputs; } {
    systems = builtins.attrNames inputs.holonix.devShells;
    perSystem = { inputs', pkgs, ... }:
      let
        # Override arguments passed in to Holochain build with above feature arguments.
        customHolochain = inputs'.holonix.packages.holochain.override {
          cargoExtraArgs = "--features test-utils";
        };
      in
      {
        formatter = pkgs.nixpkgs-fmt;

        devShells.default = pkgs.mkShell {
          packages = [
            # Include custom builds of Holochain in dev shell.
            customHolochain
          ]
          ++ (with inputs'.holonix.packages; [
            holochain
            bootstrap-srv
            lair-keystore
            rust
          ]) ++ (with pkgs; [
            nodejs_20

            (lib.optional pkgs.stdenv.isDarwin [
                pkgs.libiconv
                pkgs.darwin.apple_sdk.frameworks.CoreFoundation
                pkgs.darwin.apple_sdk.frameworks.Security
                pkgs.darwin.apple_sdk.frameworks.SystemConfiguration
              ])
          ]);

          shellHook = ''
            export PS1='\[\033[1;34m\][holonix:\w]\$\[\033[0m\] '
          '';
        };
      };
  };
}
