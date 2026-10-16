/**
 * Estilo do menu principal do jogo (mockup do usuário): a "capa" do app, sempre escura — como a mesa do
 * Painel (hudTheme.ts). As cores literais do mockup ficam isoladas aqui; o resto da interface usa os tokens
 * do tema.
 */
export const Menu = {
  /** Fundo por enquanto — a arte de fundo do jogo entra neste lugar quando existir. */
  background: '#000000',
  /** Painel dos botões: miolo escuro com moldura verde (a bandeira). */
  panel: 'rgba(5, 14, 8, 0.55)',
  panelBorder: '#3c9e52',
  /** Botões: fundo escuro translúcido com borda dourada, como no mockup. */
  button: 'rgba(8, 13, 24, 0.72)',
  buttonPressed: 'rgba(26, 38, 62, 0.92)',
  buttonBorder: '#e0c04f',
  buttonBorderBright: '#ffe27a',
  /** Textos e ícones dos botões. */
  text: '#f5f2e8',
  textDim: 'rgba(245, 242, 232, 0.68)',
  icon: '#f5f2e8',
  /** Botões redondos de login (canto inferior direito). */
  socialButton: 'rgba(255, 255, 255, 0.08)',
  socialPressed: 'rgba(255, 255, 255, 0.18)',
  socialBorder: 'rgba(255, 255, 255, 0.18)',
  social: '#f5f2e8',
  /** Aviso de recurso ainda não implementado ("em breve"). */
  toast: 'rgba(16, 24, 43, 0.94)',
} as const;
