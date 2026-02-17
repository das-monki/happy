{ inputs, ... }:

{
  perSystem =
    {
      system,
      pkgs,
      config,
      ...
    }:
    {
      devshells = {
        default = {
          packages = [
            pkgs.nodejs_20
            pkgs.yarn
            pkgs.python3
            pkgs.ffmpeg
            pkgs.git
            pkgs.eas-cli
            pkgs.nixfmt-rfc-style
          ];

          env = [
            {
              name = "LANG";
              value = "en_US.UTF-8";
            }
          ];

          commands = [
            {
              name = "dev";
              help = "Run a workspace in dev mode: dev <cli|server|agent|app|wire>";
              command = ''
                workspace="''${1:-}"
                case "$workspace" in
                  cli)    yarn workspace happy-coder dev ;;
                  server) yarn workspace happy-server dev ;;
                  agent)  yarn workspace @slopus/agent dev ;;
                  app)    yarn workspace happy-app start ;;
                  wire)   yarn workspace @slopus/happy-wire dev ;;
                  web)    yarn workspace happy-app web ;;
                  *)
                    echo "Usage: dev <cli|server|agent|app|web|wire>"
                    exit 1
                    ;;
                esac
              '';
            }
            {
              name = "build";
              help = "Build a workspace: build <cli|server|agent|app|wire|all>";
              command = ''
                workspace="''${1:-all}"
                case "$workspace" in
                  cli)    yarn workspace happy-coder build ;;
                  server) yarn workspace happy-server build ;;
                  agent)  yarn workspace @slopus/agent build ;;
                  app)    yarn workspace happy-app build ;;
                  wire)   yarn workspace @slopus/happy-wire build ;;
                  all)    yarn workspaces run build ;;
                  *)
                    echo "Usage: build <cli|server|agent|app|wire|all>"
                    exit 1
                    ;;
                esac
              '';
            }
            {
              name = "test";
              help = "Run tests for a workspace: test <cli|server|agent|wire|all>";
              command = ''
                workspace="''${1:-all}"
                case "$workspace" in
                  cli)    yarn workspace happy-coder test ;;
                  server) yarn workspace happy-server test ;;
                  agent)  yarn workspace @slopus/agent test ;;
                  wire)   yarn workspace @slopus/happy-wire test ;;
                  all)    yarn workspaces run test ;;
                  *)
                    echo "Usage: test <cli|server|agent|wire|all>"
                    exit 1
                    ;;
                esac
              '';
            }
            {
              name = "format";
              help = "Format code";
              command = ''
                yarn workspaces run format 2>/dev/null || true
              '';
            }
            {
              name = "lint";
              help = "Lint code";
              command = ''
                yarn workspaces run lint 2>/dev/null || true
              '';
            }
            {
              name = "db";
              help = "Run database commands for happy-server: db <start|migrate|seed|studio>";
              command = ''
                cmd="''${1:-start}"
                case "$cmd" in
                  start)   yarn workspace happy-server db ;;
                  migrate) yarn workspace happy-server prisma migrate dev ;;
                  seed)    yarn workspace happy-server prisma db seed ;;
                  studio)  yarn workspace happy-server prisma studio ;;
                  *)
                    echo "Usage: db <start|migrate|seed|studio>"
                    exit 1
                    ;;
                esac
              '';
            }
            {
              name = "nix-fmt";
              help = "Format Nix files";
              command = ''
                find . -name "*.nix" -type f -print0 | xargs -0 nixfmt
              '';
            }
          ];
        };
      };
    };
}
