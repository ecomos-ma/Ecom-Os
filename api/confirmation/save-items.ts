import { handleConfirmationSave } from "./save";

export default async function handler(req: Parameters<typeof handleConfirmationSave>[0], res: Parameters<typeof handleConfirmationSave>[1]) {
  return handleConfirmationSave(req, res, true);
}
