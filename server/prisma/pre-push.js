// Reprises de donnees a executer AVANT `prisma db push`.
//
// `db push` est lance avec --accept-data-loss : il supprime sans prevenir les
// colonnes retirees du schema. Une colonne renommee est donc vue comme une
// suppression suivie d'un ajout, et sa valeur serait perdue. Ce script recopie
// les anciennes valeurs dans les nouvelles colonnes pendant que les deux
// existent encore.
//
// Chaque reprise doit etre rejouable sans effet : le script tourne a chaque
// demarrage du conteneur, y compris quand il n'y a plus rien a reprendre.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/** Vrai si la colonne existe encore dans la base. */
async function hasColumn(table, column) {
  const rows = await prisma.$queryRaw`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ${column}
    LIMIT 1`;
  return rows.length > 0;
}

/** Grille -> echelle : gridSize/gridUnit/gridUnitLabel deviennent scalePx/scaleUnits/unitLabel. */
async function gridToScale() {
  if (!(await hasColumn('Scene', 'gridSize'))) return;

  await prisma.$executeRawUnsafe(`
    ALTER TABLE "Scene"
      ADD COLUMN IF NOT EXISTS "scalePx" INTEGER NOT NULL DEFAULT 70,
      ADD COLUMN IF NOT EXISTS "scaleUnits" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
      ADD COLUMN IF NOT EXISTS "unitLabel" TEXT NOT NULL DEFAULT 'm'`);

  const updated = await prisma.$executeRawUnsafe(`
    UPDATE "Scene" SET
      "scalePx"    = "gridSize",
      "scaleUnits" = "gridUnit",
      "unitLabel"  = "gridUnitLabel"`);

  console.log(`[pre-push] echelle reprise depuis la grille sur ${updated} scene(s)`);
}

try {
  await gridToScale();
} catch (error) {
  // Une reprise ratee ne doit pas empecher l'API de demarrer : au pire les
  // scenes repartent sur l'echelle par defaut, ce qui reste reparable a la main.
  console.error('[pre-push] avertissement :', error.message);
} finally {
  await prisma.$disconnect();
}
