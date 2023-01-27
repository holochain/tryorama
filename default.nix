let
  holonixPath = (import ./nix/sources.nix).holonix;
  holonix = import (holonixPath) {
    holochainVersionId = "v0_1_0";
    include = {
      holochainBinaries = true;
      holochainDependencies = true; # security framework needed on macos
      node = false;
      happs = false;
      scaffolding = false;
      introspection = false;
      launcher = false;
      test = false;
      release = false;
      openssl = false;
      linux = false;
      git = false;
    };
  };
  nixpkgs = holonix.pkgs;
in
nixpkgs.mkShell {
  inputsFrom = [ holonix.main ];
  packages = with nixpkgs; [
    nodejs
  ];
}
