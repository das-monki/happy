# Nix packages for happy-coder (CLI) and happy-server
{ inputs, ... }:

{
  perSystem =
    {
      system,
      pkgs,
      lib,
      ...
    }:
    let
      # Source filter: exclude packages/dirs not needed for building CLI or server
      filteredSrc = lib.cleanSourceWith {
        src = ../../.;
        filter =
          path: type:
          let
            relPath = lib.removePrefix (toString ../../. + "/") (toString path);
          in
          !(
            lib.hasPrefix "packages/happy-app" relPath
            || lib.hasPrefix "packages/happy-agent" relPath
            || lib.hasPrefix ".git" relPath
            || relPath == "node_modules"
            || lib.hasPrefix "node_modules/" relPath
            || relPath == "dist"
            || lib.hasPrefix ".pgdata" relPath
            || lib.hasPrefix ".minio" relPath
            || lib.hasPrefix ".logs" relPath
            || lib.hasPrefix "result" relPath
          );
      };

      # Offline yarn cache from the root yarn.lock
      yarnOfflineCache = pkgs.fetchYarnDeps {
        yarnLock = ../../yarn.lock;
        hash = "sha256-NHNRMqEdq9+KUzpgAtApIRuPjmZYULHh9vYugahAcwc=";
      };
    in
    {
      packages = {
        # ── happy-coder (CLI) ──────────────────────────────────────────
        happy-coder = pkgs.stdenv.mkDerivation {
          pname = "happy-coder";
          version = "0.14.0-0";

          src = filteredSrc;

          nativeBuildInputs = with pkgs; [
            nodejs_20
            yarn
            yarnConfigHook
            makeWrapper
          ];

          inherit yarnOfflineCache;

          # Skip the root postinstall that tries to build happy-wire
          preConfigure = ''
            export SKIP_HAPPY_WIRE_BUILD=1
            export HOME=$(mktemp -d)
          '';

          buildPhase = ''
            runHook preBuild

            # Build happy-wire first (shared dependency)
            yarn workspace @slopus/happy-wire build

            # Unpack platform-specific tools (difftastic, ripgrep)
            node packages/happy-cli/scripts/unpack-tools.cjs

            # Build happy-coder with pkgroll
            yarn workspace happy-coder build

            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall

            # Replicate monorepo layout so Node.js module resolution works
            mkdir -p $out/lib/happy-coder/packages/happy-wire
            mkdir -p $out/lib/happy-coder/packages/happy-cli

            # Root node_modules (hoisted dependencies)
            cp -r node_modules $out/lib/happy-coder/

            # Remove broken symlinks (workspace cross-references we don't ship)
            find $out/lib/happy-coder/node_modules -xtype l -delete

            # happy-wire built output + its node_modules (zod is nohoisted)
            cp -r packages/happy-wire/dist $out/lib/happy-coder/packages/happy-wire/
            cp packages/happy-wire/package.json $out/lib/happy-coder/packages/happy-wire/
            if [ -d packages/happy-wire/node_modules ]; then
              cp -r packages/happy-wire/node_modules $out/lib/happy-coder/packages/happy-wire/
            fi

            # happy-cli artifacts
            cp -r packages/happy-cli/dist $out/lib/happy-coder/packages/happy-cli/
            cp -r packages/happy-cli/bin $out/lib/happy-coder/packages/happy-cli/
            cp -r packages/happy-cli/tools $out/lib/happy-coder/packages/happy-cli/
            cp packages/happy-cli/package.json $out/lib/happy-coder/packages/happy-cli/

            # Workspace node_modules (nohoisted deps)
            if [ -d packages/happy-cli/node_modules ]; then
              cp -r packages/happy-cli/node_modules $out/lib/happy-coder/packages/happy-cli/
            fi

            # Create wrapper scripts
            mkdir -p $out/bin

            makeWrapper ${pkgs.nodejs_20}/bin/node $out/bin/happy \
              --add-flags "--no-warnings" \
              --add-flags "--no-deprecation" \
              --add-flags "$out/lib/happy-coder/packages/happy-cli/dist/index.mjs" \
              --prefix PATH : ${lib.makeBinPath [ pkgs.nodejs_20 ]}

            makeWrapper ${pkgs.nodejs_20}/bin/node $out/bin/happy-mcp \
              --add-flags "--no-warnings" \
              --add-flags "--no-deprecation" \
              --add-flags "$out/lib/happy-coder/packages/happy-cli/dist/codex/happyMcpStdioBridge.mjs" \
              --prefix PATH : ${lib.makeBinPath [ pkgs.nodejs_20 ]}

            runHook postInstall
          '';

          meta = {
            description = "Mobile and Web client for Claude Code and Codex";
            homepage = "https://github.com/slopus/happy-cli";
            license = lib.licenses.mit;
            mainProgram = "happy";
          };
        };

        # ── happy-server ───────────────────────────────────────────────
        happy-server = pkgs.stdenv.mkDerivation {
          pname = "happy-server";
          version = "0.0.0";

          src = filteredSrc;

          nativeBuildInputs = with pkgs; [
            nodejs_20
            yarn
            yarnConfigHook
            makeWrapper
            python3
          ];

          buildInputs = [ pkgs.prisma-engines ];

          inherit yarnOfflineCache;

          preConfigure = ''
            export SKIP_HAPPY_WIRE_BUILD=1
            export HOME=$(mktemp -d)

            # Point Prisma at nixpkgs engines
            export PRISMA_QUERY_ENGINE_LIBRARY="${pkgs.prisma-engines}/lib/libquery_engine.node"
            export PRISMA_SCHEMA_ENGINE_BINARY="${pkgs.prisma-engines}/bin/schema-engine"
            export PRISMA_SKIP_POSTINSTALL_GENERATE=true
          '';

          buildPhase = ''
            runHook preBuild

            # Build happy-wire first (shared dependency)
            yarn workspace @slopus/happy-wire build

            # Generate Prisma client
            yarn workspace happy-server generate

            # Typecheck
            yarn workspace happy-server build

            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall

            # Replicate monorepo layout so Node.js module resolution works
            mkdir -p $out/lib/happy-server/packages/happy-wire
            mkdir -p $out/lib/happy-server/packages/happy-server

            # Root node_modules (hoisted dependencies)
            cp -r node_modules $out/lib/happy-server/

            # Remove broken symlinks (workspace cross-references we don't ship)
            find $out/lib/happy-server/node_modules -xtype l -delete

            # happy-wire built output + its node_modules (zod is nohoisted)
            cp -r packages/happy-wire/dist $out/lib/happy-server/packages/happy-wire/
            cp packages/happy-wire/package.json $out/lib/happy-server/packages/happy-wire/
            if [ -d packages/happy-wire/node_modules ]; then
              cp -r packages/happy-wire/node_modules $out/lib/happy-server/packages/happy-wire/
            fi

            # happy-server sources and config
            cp -r packages/happy-server/sources $out/lib/happy-server/packages/happy-server/
            cp -r packages/happy-server/prisma $out/lib/happy-server/packages/happy-server/
            cp packages/happy-server/tsconfig.json $out/lib/happy-server/packages/happy-server/
            cp packages/happy-server/package.json $out/lib/happy-server/packages/happy-server/

            # Workspace node_modules (including generated Prisma client)
            if [ -d packages/happy-server/node_modules ]; then
              cp -r packages/happy-server/node_modules $out/lib/happy-server/packages/happy-server/
            fi

            # Generated Prisma client (.prisma at root) — dereference symlinks
            # since engine binaries are nix store paths (read-only in the store)
            if [ -d node_modules/.prisma ]; then
              rm -rf $out/lib/happy-server/node_modules/.prisma
              cp -rL node_modules/.prisma $out/lib/happy-server/node_modules/
            fi

            # Create wrapper scripts
            mkdir -p $out/bin

            # Main server binary: run via tsx (which is a dependency)
            makeWrapper ${pkgs.nodejs_20}/bin/node $out/bin/happy-server \
              --add-flags "$out/lib/happy-server/node_modules/.bin/tsx" \
              --add-flags "$out/lib/happy-server/packages/happy-server/sources/main.ts" \
              --set PRISMA_QUERY_ENGINE_LIBRARY "${pkgs.prisma-engines}/lib/libquery_engine.node" \
              --set PRISMA_SCHEMA_ENGINE_BINARY "${pkgs.prisma-engines}/bin/schema-engine" \
              --chdir "$out/lib/happy-server/packages/happy-server" \
              --prefix PATH : ${
                lib.makeBinPath [
                  pkgs.nodejs_20
                  pkgs.ffmpeg
                  pkgs.python3
                ]
              }

            # Migration binary
            makeWrapper ${pkgs.nodejs_20}/bin/node $out/bin/happy-server-migrate \
              --add-flags "$out/lib/happy-server/node_modules/.bin/prisma" \
              --add-flags "migrate" \
              --add-flags "deploy" \
              --set PRISMA_QUERY_ENGINE_LIBRARY "${pkgs.prisma-engines}/lib/libquery_engine.node" \
              --set PRISMA_SCHEMA_ENGINE_BINARY "${pkgs.prisma-engines}/bin/schema-engine" \
              --chdir "$out/lib/happy-server/packages/happy-server" \
              --prefix PATH : ${lib.makeBinPath [ pkgs.nodejs_20 ]}

            runHook postInstall
          '';

          meta = {
            description = "Happy Server - backend for Happy mobile and CLI clients";
            homepage = "https://github.com/slopus/happy-server";
            license = lib.licenses.mit;
            mainProgram = "happy-server";
          };
        };
      };
    };
}
