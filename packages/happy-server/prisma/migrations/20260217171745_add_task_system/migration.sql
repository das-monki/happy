-- AlterTable
ALTER TABLE "Artifact" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'artifact',
ADD COLUMN     "sourceSessionId" TEXT,
ADD COLUMN     "taskId" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "taskId" TEXT;

-- CreateTable
CREATE TABLE "ArtifactVersion" (
    "id" TEXT NOT NULL,
    "artifactId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "header" BYTEA NOT NULL,
    "body" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArtifactVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "header" BYTEA NOT NULL,
    "headerVersion" INTEGER NOT NULL DEFAULT 0,
    "body" BYTEA NOT NULL,
    "bodyVersion" INTEGER NOT NULL DEFAULT 0,
    "dataEncryptionKey" BYTEA NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArtifactVersion_artifactId_idx" ON "ArtifactVersion"("artifactId");

-- CreateIndex
CREATE UNIQUE INDEX "ArtifactVersion_artifactId_version_key" ON "ArtifactVersion"("artifactId", "version");

-- CreateIndex
CREATE INDEX "Task_accountId_idx" ON "Task"("accountId");

-- CreateIndex
CREATE INDEX "Task_accountId_updatedAt_idx" ON "Task"("accountId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "Artifact_taskId_idx" ON "Artifact"("taskId");

-- CreateIndex
CREATE INDEX "Session_taskId_idx" ON "Session"("taskId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Artifact" ADD CONSTRAINT "Artifact_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArtifactVersion" ADD CONSTRAINT "ArtifactVersion_artifactId_fkey" FOREIGN KEY ("artifactId") REFERENCES "Artifact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
