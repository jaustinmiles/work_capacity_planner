-- AlterTable
ALTER TABLE "public"."DeepWorkBoard" ADD COLUMN     "endeavorId" TEXT;

-- CreateIndex
CREATE INDEX "DeepWorkBoard_endeavorId_idx" ON "public"."DeepWorkBoard"("endeavorId");

-- AddForeignKey
ALTER TABLE "public"."DeepWorkBoard" ADD CONSTRAINT "DeepWorkBoard_endeavorId_fkey" FOREIGN KEY ("endeavorId") REFERENCES "public"."Endeavor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
