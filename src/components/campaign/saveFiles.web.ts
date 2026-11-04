import * as DocumentPicker from 'expo-document-picker';

import { saveFileTooLargeMessage } from './saveFileRules';

/** Versão web: o Metro escolhe este arquivo no lugar de `saveFiles.ts`. Mesma API. */

/** Tempo para o navegador iniciar o download antes de liberar a URL (Safari pode ignorar uma revogação imediata). */
const REVOKE_DELAY_MS = 1000;

/** Baixa o save como arquivo pelo navegador (Blob + link com `download`). */
export async function shareSaveFile(fileName: string, json: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

/**
 * Escolhe um arquivo de save e devolve o texto dele. `null` se o jogador cancelou. Recusa arquivos acima de
 * `MAX_SAVE_FILE_BYTES` com uma mensagem pt-BR (lançada como Error).
 */
export async function pickSaveFileText(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', 'text/plain', '*/*'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled) return null;
  const [asset] = result.assets;
  if (!asset) return null;
  const tooLarge = saveFileTooLargeMessage(asset.size ?? asset.file?.size);
  if (tooLarge) throw new Error(tooLarge);
  if (asset.file) return asset.file.text();
  return fetch(asset.uri).then((response) => response.text());
}
