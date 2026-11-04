import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { saveFileTooLargeMessage } from './saveFileRules';

/** Versão nativa (iOS/Android). A web usa `saveFiles.web.ts`, escolhido pelo Metro. */

const SHARE_UNAVAILABLE = 'Não é possível compartilhar arquivos neste aparelho.';

/**
 * Exporta o save: grava `json` num arquivo do cache e abre a folha de compartilhamento do sistema (salvar em Arquivos,
 * enviar por outro app etc.). Cancelar a folha não é erro.
 */
export async function shareSaveFile(fileName: string, json: string): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error(SHARE_UNAVAILABLE);
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  await file.write(json);
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'Exportar save' });
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
  const file = new File(asset.uri);
  const tooLarge = saveFileTooLargeMessage(asset.size ?? file.info().size);
  if (tooLarge) throw new Error(tooLarge);
  return file.text();
}
