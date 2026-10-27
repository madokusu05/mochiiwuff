import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopDir = resolve(scriptDir, "..");
const source = resolve(desktopDir, "..", "models", "Mika.vrm");
const destination = resolve(desktopDir, "public", "models", "Mika.vrm");

try {
  const model = await stat(source);
  if (!model.isFile() || model.size < 12) {
    throw new Error("Le fichier VRM est vide ou invalide.");
  }
} catch (error) {
  if (error.code === "ENOENT") {
    throw new Error(
      `Modèle Mika introuvable : ${source}\nCopie ton fichier Mika.vrm dans le dossier mika-chat\\models.`,
      { cause: error },
    );
  }
  throw error;
}

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
console.log("Modèle 3D local prêt pour l'application.");
