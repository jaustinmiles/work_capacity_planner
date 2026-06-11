-- CreateTable
CREATE TABLE "SpatialScene" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Spatial Scene',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpatialScene_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpatialEntity" (
    "id" TEXT NOT NULL,
    "sceneId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT,
    "noteText" TEXT,
    "parentId" TEXT,
    "positionX" DOUBLE PRECISION NOT NULL,
    "positionY" DOUBLE PRECISION NOT NULL,
    "positionZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotationX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotationY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotationZ" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotationW" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "scale" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "isRendered" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpatialEntity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpatialScene_sessionId_idx" ON "SpatialScene"("sessionId");

-- CreateIndex
CREATE INDEX "SpatialEntity_sceneId_idx" ON "SpatialEntity"("sceneId");

-- CreateIndex
CREATE INDEX "SpatialEntity_sceneId_kind_idx" ON "SpatialEntity"("sceneId", "kind");

-- AddForeignKey
ALTER TABLE "SpatialScene" ADD CONSTRAINT "SpatialScene_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpatialEntity" ADD CONSTRAINT "SpatialEntity_sceneId_fkey" FOREIGN KEY ("sceneId") REFERENCES "SpatialScene"("id") ON DELETE CASCADE ON UPDATE CASCADE;
