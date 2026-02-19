{
  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-25.05";

    devshell = {
      url = "github:numtide/devshell";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    flake-parts.url = "github:hercules-ci/flake-parts";
  };

  outputs =
    inputs@{ self, flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {

      systems = [
        "aarch64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];

      imports = [
        inputs.devshell.flakeModule
        ./nix/modules/devshell.nix
        ./nix/modules/packages.nix
      ];

      flake = {
        nixosModules.happy-server = ./nix/modules/happy-server.nix;
        nixosModules.default = self.nixosModules.happy-server;
      };

      perSystem =
        {
          pkgs,
          lib,
          system,
          ...
        }:
        {
          _module.args.pkgs = import self.inputs.nixpkgs {
            inherit system;
          };
        };
    };
}
