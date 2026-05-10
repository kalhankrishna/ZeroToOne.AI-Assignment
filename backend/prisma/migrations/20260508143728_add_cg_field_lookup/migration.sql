-- CreateTable
CREATE TABLE "cg_field_lookup" (
    "id" SERIAL NOT NULL,
    "fieldName" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "cg_field_lookup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cg_field_lookup_fieldName_value_key" ON "cg_field_lookup"("fieldName", "value");
