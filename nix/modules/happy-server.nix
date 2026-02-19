# Happy Server NixOS module
# Provides happy-server as a native systemd service with PostgreSQL, Redis, and MinIO
{
  config,
  lib,
  pkgs,
  ...
}:
let
  cfg = config.services.happy-server;
in
{
  options.services.happy-server = {
    enable = lib.mkEnableOption "Happy Server";

    package = lib.mkOption {
      type = lib.types.package;
      description = "The happy-server package to use";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 3005;
      description = "Port to listen on";
    };

    seedFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = "Path to file containing the HANDY_MASTER_SECRET for encryption";
    };

    environmentFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      description = "Environment file with additional secrets (e.g., S3 credentials)";
    };

    database = {
      name = lib.mkOption {
        type = lib.types.str;
        default = "happy";
        description = "PostgreSQL database name";
      };

      user = lib.mkOption {
        type = lib.types.str;
        default = "happy";
        description = "PostgreSQL user";
      };

      createLocally = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Create database and user locally";
      };
    };

    redis = {
      createLocally = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Create Redis instance locally";
      };
    };

    minio = {
      createLocally = lib.mkOption {
        type = lib.types.bool;
        default = true;
        description = "Create MinIO instance locally for S3-compatible storage";
      };

      bucket = lib.mkOption {
        type = lib.types.str;
        default = "happy";
        description = "MinIO bucket name";
      };

      rootCredentialsFile = lib.mkOption {
        type = lib.types.nullOr lib.types.path;
        default = null;
        description = "Path to file containing MINIO_ROOT_USER and MINIO_ROOT_PASSWORD";
      };
    };
  };

  config = lib.mkIf cfg.enable {
    # PostgreSQL configuration
    services.postgresql = lib.mkIf cfg.database.createLocally {
      enable = true;
      package = pkgs.postgresql_15;
      ensureDatabases = [ cfg.database.name ];
      ensureUsers = [
        {
          name = cfg.database.user;
          ensureDBOwnership = true;
        }
      ];
      authentication = lib.mkForce ''
        local all all trust
        host all all 127.0.0.1/32 trust
        host all all ::1/128 trust
      '';
    };

    # Redis configuration
    services.redis.servers.happy = lib.mkIf cfg.redis.createLocally {
      enable = true;
      port = 6379;
      bind = "127.0.0.1";
    };

    # MinIO configuration for S3-compatible storage
    services.minio = lib.mkIf cfg.minio.createLocally {
      enable = true;
      listenAddress = "127.0.0.1:9000";
      consoleAddress = "127.0.0.1:9001";
      dataDir = [ "/var/lib/minio/data" ];
      inherit (cfg.minio) rootCredentialsFile;
    };

    # Create MinIO bucket after service starts
    systemd.services.minio-bucket-init = lib.mkIf cfg.minio.createLocally {
      description = "Create MinIO bucket for happy-server";
      wantedBy = [ "multi-user.target" ];
      after = [ "minio.service" ];
      requires = [ "minio.service" ];
      path = [
        pkgs.minio-client
        pkgs.getent
      ];
      serviceConfig = {
        Type = "oneshot";
        RemainAfterExit = true;
        EnvironmentFile = cfg.minio.rootCredentialsFile;
      };
      script = ''
        # Wait for MinIO to be ready
        for i in $(seq 1 30); do
          mc alias set local http://127.0.0.1:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" && break
          sleep 1
        done

        # Create bucket if it doesn't exist
        mc mb --ignore-existing local/${cfg.minio.bucket}
      '';
    };

    # Run Prisma migrations before server starts
    systemd.services.happy-server-migrate = {
      description = "Run happy-server database migrations";
      wantedBy = [ "happy-server.service" ];
      before = [ "happy-server.service" ];
      after = lib.optional cfg.database.createLocally "postgresql.service";
      requires = lib.optional cfg.database.createLocally "postgresql.service";
      serviceConfig = {
        Type = "oneshot";
        RemainAfterExit = true;
        ExecStart = "${cfg.package}/bin/happy-server-migrate";
        Environment = [
          "DATABASE_URL=postgresql://${cfg.database.user}@localhost/${cfg.database.name}"
          "NODE_ENV=production"
        ];
        EnvironmentFile = lib.optional (cfg.environmentFile != null) cfg.environmentFile;
      };
    };

    # Main happy-server service
    systemd.services.happy-server = {
      description = "Happy Server";
      wantedBy = [ "multi-user.target" ];
      after = [
        "network.target"
        "happy-server-migrate.service"
      ]
      ++ lib.optional cfg.database.createLocally "postgresql.service"
      ++ lib.optional cfg.redis.createLocally "redis-happy.service"
      ++ lib.optional cfg.minio.createLocally "minio-bucket-init.service";
      requires = [
        "happy-server-migrate.service"
      ]
      ++ lib.optional cfg.database.createLocally "postgresql.service"
      ++ lib.optional cfg.redis.createLocally "redis-happy.service"
      ++ lib.optional cfg.minio.createLocally "minio.service";

      environment = {
        NODE_ENV = "production";
        PORT = toString cfg.port;
        DATABASE_URL = "postgresql://${cfg.database.user}@localhost/${cfg.database.name}";
      }
      // lib.optionalAttrs cfg.redis.createLocally {
        REDIS_URL = "redis://localhost:6379";
      }
      // lib.optionalAttrs cfg.minio.createLocally {
        S3_HOST = "127.0.0.1";
        S3_PORT = "9000";
        S3_USE_SSL = "false";
        S3_BUCKET = cfg.minio.bucket;
        S3_PUBLIC_URL = "http://127.0.0.1:9000/${cfg.minio.bucket}";
      };

      script = ''
        ${lib.optionalString (cfg.seedFile != null) ''
          export HANDY_MASTER_SECRET="$(cat ${cfg.seedFile})"
        ''}

        ${lib.optionalString (cfg.minio.createLocally && cfg.minio.rootCredentialsFile != null) ''
          source ${cfg.minio.rootCredentialsFile}
          export S3_ACCESS_KEY="$MINIO_ROOT_USER"
          export S3_SECRET_KEY="$MINIO_ROOT_PASSWORD"
        ''}

        ${lib.optionalString (cfg.environmentFile != null) ''
          set -a
          source ${cfg.environmentFile}
          set +a
        ''}

        exec ${cfg.package}/bin/happy-server
      '';

      serviceConfig = {
        Type = "simple";
        Restart = "on-failure";
        RestartSec = 5;

        # Hardening
        DynamicUser = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        PrivateTmp = true;
        NoNewPrivileges = true;
        StateDirectory = "happy-server";
        WorkingDirectory = "${cfg.package}/lib/happy-server/packages/happy-server";
      };
    };
  };
}
