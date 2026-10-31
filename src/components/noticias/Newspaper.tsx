import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { shortMonthLabel } from '@/components/campaign/labels';
import {
  NEWS_FILTERS,
  NEWS_FILTER_LABEL,
  NEWS_KIND_LABEL,
  NEWS_TONE_LABEL,
  NEWS_TONE_MARK,
  newsCharacterName,
  type NewsFilter,
} from '@/components/tabs/newsView';
import type { ActiveMark, PressureBand } from '@/components/tabs/institutionsView';
import { formatNumber } from '@/components/ui';
import { Fonts, MIN_TOUCH } from '@/constants/theme';
import { useScaledStyles } from '@/hooks/use-scaled-styles';
import { useTheme } from '@/hooks/use-theme';
import type { NewsItem } from '@/engine';

import { FRONT_PAGE_PHOTOS } from './newsPhotos';
import {
  bombshellFontSize,
  leadFontSize,
  mastheadFontSize,
  NEWSPAPER_NAME,
  newspaperColumns,
  regularPage,
  type Edition,
  type NewspaperPage,
} from './newspaperView';

/** Tinta e papel do jornal: fixos nos dois temas (é um objeto da mesa, não parte da interface). */
const Paper = {
  paper: '#f2ead8',
  paperDeep: '#e9dfc7',
  paperEdge: '#d9cba9',
  ink: '#1c1813',
  inkSoft: '#4a4238',
  inkMuted: '#7a6f60',
  rule: '#2a241c',
  ruleSoft: '#c9bc9f',
  positive: '#1f6b3a',
  negative: '#9b2c1f',
  neutral: '#5a5246',
  accent: '#7a1f12',
  extra: '#8f1d10',
} as const;

const TONE_COLOR: Record<NewsItem['tone'], string> = {
  positiva: Paper.positive,
  negativa: Paper.negative,
  neutra: Paper.neutral,
};

/** Página e caderno abertos: controlados pela mesa, para o jornal dobrado mostrar a mesma página do aberto. */
export interface NewspaperView {
  page: number;
  filter: NewsFilter;
}

export interface NewspaperProps {
  width: number;
  /** Altura disponível baixa (celular deitado): cabeçalho compacto. */
  short: boolean;
  editions: readonly Edition[];
  pages: readonly NewspaperPage[];
  view: NewspaperView;
  onViewChange: (view: NewspaperView) => void;
  /** Cópia parada (jornal dobrado e animação de abrir): sem rolagem, toques nem animações de entrada. */
  still?: boolean;
  /** Resumo do mês (manchetes do relatório), só na edição mais recente. */
  summary: readonly string[];
  characters: readonly { id: string; name: string }[];
  pressure: number;
  pressureLabel: PressureBand;
  marks: readonly ActiveMark[];
  pending: readonly { key: string; title: string; monthIndex: number }[];
  /** Notícia aberta pelo marcador do mapa: o jornal abre na edição dela e a traz como manchete. */
  focusNewsId?: string;
}

/** Espaço livre no pé da página para a pílula de dobrar o jornal (da mesa) não cobrir o rodapé. */
const FOOTER_CLEARANCE = 64;

/** Duração de cada metade da virada de página. */
const TURN_OUT_MS = 300;
const TURN_IN_MS = 380;

/**
 * O jornal da mesa: cabeçalho com orelhas, cadernos (filtro por tipo), manchete, colunas e quadros. A manchete-bomba
 * ganha uma capa inteira antes da página comum. Folhear para a frente vira a página pela lombada (ela sai girando
 * para a esquerda e revela a de baixo); voltar traz a página de volta pelo mesmo caminho.
 */
export function Newspaper({
  width,
  short,
  editions,
  pages,
  view,
  onViewChange,
  still = false,
  summary,
  characters,
  pressure,
  pressureLabel,
  marks,
  pending,
  focusNewsId,
}: NewspaperProps) {
  const styles = useScaledStyles(baseStyles);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  /** 0 = página no lugar; 1 = página virada (perpendicular, saindo pela lombada). */
  const flip = useSharedValue(0);
  /** 0 = página no alto da pilha; 1 = página embaixo, à sombra da que está virando. */
  const under = useSharedValue(0);
  const fade = useSharedValue(1);
  // Durante a virada a página vira uma textura de GPU (Android): a animação não redesenha o texto a cada quadro.
  const [turning, setTurning] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTimeout(settle.current);
    },
    [],
  );

  const page = pages[Math.min(view.page, pages.length - 1)];
  const edition = editions[page.editionIndex];
  const columns = newspaperColumns(width);
  const pad = width < 420 ? 14 : 22;
  const inner = width - pad * 2;

  /** Folheia: +1 = página seguinte (edições mais antigas), −1 = anterior. */
  const turn = (dir: -1 | 1) => {
    const next = view.page + dir;
    if (still || turning || next < 0 || next >= pages.length) return;
    setTurning(true);
    clearTimeout(settle.current);
    settle.current = setTimeout(() => setTurning(false), TURN_OUT_MS + TURN_IN_MS + 40);
    clearTimeout(timer.current);
    if (dir === 1) {
      // A página de cima gira pela lombada e some; a de baixo sai da sombra.
      flip.set(withTiming(1, { duration: TURN_OUT_MS, easing: Easing.in(Easing.quad) }));
      timer.current = setTimeout(() => {
        onViewChange({ ...view, page: next });
        scroll.current?.scrollTo({ y: 0, animated: false });
        flip.set(0);
        under.set(withSequence(withTiming(1, { duration: 0 }), withTiming(0, { duration: TURN_IN_MS })));
      }, TURN_OUT_MS);
    } else {
      // A página atual afunda na sombra; a anterior volta girando pela lombada e cobre a pilha.
      under.set(withTiming(1, { duration: TURN_OUT_MS * 0.7 }));
      timer.current = setTimeout(() => {
        onViewChange({ ...view, page: next });
        scroll.current?.scrollTo({ y: 0, animated: false });
        under.set(0);
        flip.set(
          withSequence(
            withTiming(1, { duration: 0 }),
            withTiming(0, { duration: TURN_IN_MS, easing: Easing.out(Easing.cubic) }),
          ),
        );
      }, TURN_OUT_MS * 0.7);
    }
  };

  const pickFilter = (f: NewsFilter) => {
    if (f === view.filter) return;
    fade.set(withSequence(withTiming(0.15, { duration: 0 }), withTiming(1, { duration: 280 })));
    onViewChange({ ...view, filter: f });
  };

  const pageStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ perspective: 1400 }, { rotateY: `${flip.value * -92}deg` }, { scale: 1 - under.value * 0.025 }],
  }));
  const shadeStyle = useAnimatedStyle(() => ({
    opacity: Math.max(flip.value * 0.45, under.value * 0.3),
  }));

  const ears = !short && inner >= 600;

  return (
    <View style={styles.sheet}>
      <Animated.View style={[styles.page, pageStyle]} renderToHardwareTextureAndroid={turning}>
        <ScrollView
          ref={scroll}
          scrollEnabled={!still}
          contentContainerStyle={{ padding: pad, paddingBottom: pad + FOOTER_CLEARANCE }}
          showsVerticalScrollIndicator={false}>
          <Masthead
            edition={edition}
            ears={ears}
            titleSize={mastheadFontSize(inner - (ears ? EAR_SPACE : 0), short)}
            short={short}
            pressureLabel={pressureLabel}
            canNewer={view.page > 0}
            canOlder={view.page < pages.length - 1}
            onTurn={turn}
          />
          {page.kind === 'bomba' ? (
            <BombshellPage
              key={page.item.id}
              item={page.item}
              width={inner}
              still={still}
              characterName={newsCharacterName(page.item, characters)}
              onContinue={() => turn(1)}
            />
          ) : (
            <>
              <Sections value={view.filter} onChange={pickFilter} />
              <RegularPage
                edition={edition}
                filter={view.filter}
                skip={page.skip}
                focusId={focusNewsId}
                width={inner}
                columns={columns}
                characters={characters}
                summary={page.editionIndex === 0 ? summary : []}
                pressure={pressure}
                pressureLabel={pressureLabel}
                marks={marks}
                pending={pending}
              />
            </>
          )}
          <PageFooter
            number={view.page + 1}
            total={pages.length}
            canOlder={view.page < pages.length - 1}
            onTurn={turn}
          />
        </ScrollView>
        <Animated.View style={[StyleSheet.absoluteFill, styles.turnShade, shadeStyle]} pointerEvents="none" />
      </Animated.View>
      {/* Bordas do papel: um leve escurecido nas margens, como papel-jornal envelhecido. */}
      <View style={styles.edgeTop} pointerEvents="none" />
      <View style={styles.edgeBottom} pointerEvents="none" />
      <View style={styles.spine} pointerEvents="none" />
    </View>
  );
}

/** Largura das duas orelhas do cabeçalho (com o espaço entre elas e o título). */
const EAR_SPACE = 2 * 128;

function Masthead({
  edition,
  ears,
  titleSize,
  short,
  pressureLabel,
  canNewer,
  canOlder,
  onTurn,
}: {
  edition: Edition | undefined;
  ears: boolean;
  titleSize: number;
  short: boolean;
  pressureLabel: PressureBand;
  canNewer: boolean;
  canOlder: boolean;
  onTurn: (dir: -1 | 1) => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const year = edition ? Math.floor((edition.number - 1) / 12) + 1 : 1;
  return (
    <View>
      <View style={styles.topLine}>
        <Text style={styles.topText}>{`ANO ${ROMAN[year - 1] ?? year} · Nº ${edition?.number ?? 0}`}</Text>
        <Text style={styles.topText}>BRASÍLIA</Text>
        <Text style={styles.topText}>R$ 4,50</Text>
      </View>
      <View style={styles.ruleDouble} />
      <View style={styles.titleRow}>
        <TurnButton label="‹" hint="Página anterior" enabled={canNewer} onPress={() => onTurn(-1)} />
        {ears && <Ear title="Edição" line={edition ? edition.label : 'De estreia'} />}
        <View style={styles.titleBlock}>
          <Text
            style={[styles.title, { fontSize: titleSize, lineHeight: Math.round(titleSize * 1.15) }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            accessibilityRole="header">
            {NEWSPAPER_NAME}
          </Text>
          {!short && <Text style={styles.slogan}>— Fundado para vigiar o poder —</Text>}
        </View>
        {ears && <Ear title="Termômetro" line={`Impeachment: ${pressureLabel}`} />}
        <TurnButton label="›" hint="Próxima página" enabled={canOlder} onPress={() => onTurn(1)} />
      </View>
      <View style={styles.ruleThin} />
      <View style={styles.dateRow}>
        <Text style={styles.dateLine}>{edition ? edition.label : 'Aguardando o primeiro mês'}</Text>
        <Text style={styles.dateLine}>Simulação fictícia</Text>
      </View>
      <View style={styles.ruleThick} />
    </View>
  );
}

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];

/** Orelha do cabeçalho: quadrinho ao lado do nome do jornal. */
function Ear({ title, line }: { title: string; line: string }) {
  const styles = useScaledStyles(baseStyles);
  return (
    <View style={styles.ear}>
      <Text style={styles.earTitle}>{title.toUpperCase()}</Text>
      <Text style={styles.earLine} numberOfLines={2}>
        {line}
      </Text>
    </View>
  );
}

function TurnButton({
  label,
  hint,
  enabled,
  onPress,
}: {
  label: string;
  hint: string;
  enabled: boolean;
  onPress: () => void;
}) {
  const styles = useScaledStyles(baseStyles);
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={hint}
      accessibilityState={{ disabled: !enabled }}
      style={({ pressed }) => [styles.turn, !enabled && styles.turnOff, pressed && styles.turnPressed]}>
      <Text style={styles.turnText}>{label}</Text>
    </Pressable>
  );
}

/** Cadernos do jornal: o filtro por tipo de notícia. */
function Sections({ value, onChange }: { value: NewsFilter; onChange: (f: NewsFilter) => void }) {
  const styles = useScaledStyles(baseStyles);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.sections}
      accessibilityRole="radiogroup">
      {NEWS_FILTERS.map((f) => {
        const selected = f === value;
        return (
          <Pressable
            key={f}
            onPress={() => onChange(f)}
            accessibilityRole="radio"
            accessibilityLabel={`Caderno: ${NEWS_FILTER_LABEL[f]}`}
            accessibilityState={{ checked: selected }}
            style={styles.section}>
            <Text style={[styles.sectionText, selected && styles.sectionOn]}>{NEWS_FILTER_LABEL[f].toUpperCase()}</Text>
            <View style={[styles.sectionBar, selected && styles.sectionBarOn]} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function Kicker({ item, light = false }: { item: NewsItem; light?: boolean }) {
  const styles = useScaledStyles(baseStyles);
  return (
    <Text style={[styles.kicker, { color: light ? '#f6e9d0' : TONE_COLOR[item.tone] }]}>
      {`${NEWS_TONE_MARK[item.tone]} ${NEWS_KIND_LABEL[item.kind].toUpperCase()} · ${NEWS_TONE_LABEL[item.tone]}`}
    </Text>
  );
}

/**
 * Capa-bomba: faixa de edição extra, título gigante que "carimba" a página ao chegar, foto com legenda (quando
 * cadastrada em `newsPhotos.ts`) e a causa em destaque.
 */
function BombshellPage({
  item,
  width,
  still,
  characterName,
  onContinue,
}: {
  item: NewsItem;
  width: number;
  still: boolean;
  characterName: string | undefined;
  onContinue: () => void;
}) {
  const styles = useScaledStyles(baseStyles);
  const { textScale } = useTheme();
  const size = bombshellFontSize(width) * textScale;
  const photo = item.sourceId !== undefined ? FRONT_PAGE_PHOTOS[item.sourceId] : undefined;
  const stamp = useSharedValue(still ? 1 : 0);
  useEffect(() => {
    if (still) return;
    stamp.set(withDelay(120, withTiming(1, { duration: 520, easing: Easing.out(Easing.back(1.6)) })));
  }, [still, stamp, item.id]);
  const stampStyle = useAnimatedStyle(() => ({
    opacity: interpolate(stamp.value, [0, 0.4], [0, 1], 'clamp'),
    transform: [{ scale: interpolate(stamp.value, [0, 1], [1.35, 1]) }, { rotateZ: `${(1 - stamp.value) * -2}deg` }],
  }));
  return (
    <View style={styles.bomb}>
      <View style={styles.extraBand}>
        <Text style={styles.extraText}>EDIÇÃO EXTRA</Text>
        <Kicker item={item} light />
      </View>
      <Animated.View style={stampStyle}>
        <Text style={[styles.bombTitle, { fontSize: size, lineHeight: Math.round(size * 1.02) }]}>
          {item.headline.toUpperCase()}
        </Text>
      </Animated.View>
      <View style={styles.ruleThick} />
      {photo?.photo ? <FrontPhoto source={photo.photo} caption={photo.caption} still={still} /> : null}
      <Text style={[styles.bombDeck, !photo?.photo && styles.bombDeckBig]}>{item.cause}</Text>
      {characterName && <Text style={styles.byline}>{`Com declarações de ${characterName}`}</Text>}
      <Text style={styles.byline}>Da Redação, em Brasília</Text>
      <Pressable
        onPress={onContinue}
        accessibilityRole="button"
        accessibilityLabel="Ler a edição na próxima página"
        style={({ pressed }) => [styles.continue, pressed && styles.turnPressed]}>
        <Text style={styles.continueText}>Leia a edição completa na próxima página ›</Text>
      </Pressable>
    </View>
  );
}

/** Foto da capa: entra com um esmaecer e se aproxima devagar (efeito Ken Burns). */
function FrontPhoto({
  source,
  caption,
  still,
}: {
  source: NonNullable<(typeof FRONT_PAGE_PHOTOS)[string]['photo']>;
  caption: string | undefined;
  still: boolean;
}) {
  const styles = useScaledStyles(baseStyles);
  const zoom = useSharedValue(still ? 1 : 0);
  useEffect(() => {
    if (still) return;
    zoom.set(withTiming(1, { duration: 7000, easing: Easing.out(Easing.quad) }));
  }, [still, zoom]);
  const zoomStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1.12 - zoom.value * 0.12 }] }));
  return (
    <View style={styles.photoFrame}>
      <View style={styles.photoClip}>
        <Animated.View style={[StyleSheet.absoluteFill, zoomStyle]}>
          <Image
            source={source}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={still ? 0 : 600}
            accessibilityIgnoresInvertColors
          />
        </Animated.View>
      </View>
      {caption && <Text style={styles.caption}>{caption}</Text>}
    </View>
  );
}

function RegularPage({
  edition,
  filter,
  skip,
  focusId,
  width,
  columns,
  characters,
  summary,
  pressure,
  pressureLabel,
  marks,
  pending,
}: {
  edition: Edition | undefined;
  filter: NewsFilter;
  skip: string | undefined;
  focusId: string | undefined;
  width: number;
  columns: 1 | 2 | 3;
  characters: readonly { id: string; name: string }[];
  summary: readonly string[];
  pressure: number;
  pressureLabel: PressureBand;
  marks: readonly ActiveMark[];
  pending: readonly { key: string; title: string; monthIndex: number }[];
}) {
  const styles = useScaledStyles(baseStyles);
  const page = regularPage(edition, filter, skip, focusId);
  return (
    <View>
      {!edition ? (
        <Text style={styles.empty}>
          A redação aguarda o primeiro mês de governo. Encerre um mês para a primeira edição chegar à mesa.
        </Text>
      ) : !page.lead ? (
        <Text style={styles.empty}>Nenhuma outra notícia deste caderno nesta edição.</Text>
      ) : (
        <>
          <Lead item={page.lead} width={width} characterName={newsCharacterName(page.lead, characters)} />
          {page.others.length > 0 && (
            <>
              <SectionHeader title="Mais notícias do mês" />
              <View style={styles.grid}>
                {page.others.map((item, i) => (
                  <Story
                    key={item.id}
                    item={item}
                    big={i === 0 && columns === 1}
                    characterName={newsCharacterName(item, characters)}
                    width={`${100 / columns}%`}
                    divider={columns > 1 && i % columns !== columns - 1}
                  />
                ))}
              </View>
            </>
          )}
        </>
      )}

      <View style={[styles.boxes, columns > 1 && styles.boxesRow]}>
        {summary.length > 0 && (
          <Box title="Em resumo">
            {summary.map((line, i) => (
              <Text key={`${i}_${line}`} style={styles.bullet}>{`■ ${line}`}</Text>
            ))}
          </Box>
        )}
        <Box title="Instituições">
          <Text style={styles.boxStrong}>{`Pressão de impeachment: ${pressureLabel}`}</Text>
          <Text style={styles.boxSmall}>{`Índice ${formatNumber(pressure, 2)} em uma escala de 0 a 1.`}</Text>
          {marks.length === 0 ? (
            <Text style={styles.boxText}>Nenhuma marca institucional ativa.</Text>
          ) : (
            marks.map((m) => (
              <Text key={m.flag} style={styles.boxText}>{`• ${m.label} (desde ${shortMonthLabel(m.sinceMonth)})`}</Text>
            ))
          )}
        </Box>
        <Box title="Na sua mesa">
          {pending.length === 0 ? (
            <Text style={styles.boxText}>Nenhum evento aguardando resposta.</Text>
          ) : (
            pending.map((p) => (
              <Text key={p.key} style={styles.boxText}>
                {`• ${p.title} `}
                <Text
                  style={styles.boxSmall}>{`(${shortMonthLabel(p.monthIndex)} · responda em Alertas e eventos)`}</Text>
              </Text>
            ))
          )}
        </Box>
      </View>
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  const styles = useScaledStyles(baseStyles);
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderRule} />
      <Text style={styles.sectionHeaderText}>{title.toUpperCase()}</Text>
      <View style={styles.sectionHeaderRule} />
    </View>
  );
}

function Lead({ item, width, characterName }: { item: NewsItem; width: number; characterName: string | undefined }) {
  const styles = useScaledStyles(baseStyles);
  const { textScale } = useTheme();
  const size = leadFontSize(width) * textScale;
  // Capitular: a primeira letra do texto em destaque, como nas aberturas de matéria.
  const [first, rest] = [item.cause.slice(0, 1), item.cause.slice(1)];
  return (
    <View style={styles.lead}>
      <Kicker item={item} />
      <Text style={[styles.leadTitle, { fontSize: size, lineHeight: Math.round(size * 1.08) }]}>{item.headline}</Text>
      <View style={styles.ruleThin} />
      <Text style={styles.leadCause}>
        <Text style={styles.dropCap}>{first}</Text>
        {rest}
      </Text>
      <Text style={styles.byline}>
        {characterName ? `Com declarações de ${characterName} · Da Redação` : 'Da Redação, em Brasília'}
      </Text>
    </View>
  );
}

function Story({
  item,
  big,
  characterName,
  width,
  divider,
}: {
  item: NewsItem;
  big: boolean;
  characterName: string | undefined;
  width: `${number}%`;
  divider: boolean;
}) {
  const styles = useScaledStyles(baseStyles);
  return (
    <View style={[styles.story, { width }, divider && styles.storyDivider]}>
      <Kicker item={item} />
      <Text style={[styles.storyTitle, big && styles.storyTitleBig]}>{item.headline}</Text>
      <Text style={styles.storyCause}>{item.cause}</Text>
      {characterName && <Text style={styles.byline}>{`Personagem: ${characterName}`}</Text>}
    </View>
  );
}

function Box({ title, children }: { title: string; children: ReactNode }) {
  const styles = useScaledStyles(baseStyles);
  return (
    <View style={styles.box}>
      <View style={styles.boxBand}>
        <Text style={styles.boxTitle}>{title.toUpperCase()}</Text>
      </View>
      <View style={styles.boxBody}>{children}</View>
    </View>
  );
}

function PageFooter({
  number,
  total,
  canOlder,
  onTurn,
}: {
  number: number;
  total: number;
  canOlder: boolean;
  onTurn: (dir: -1 | 1) => void;
}) {
  const styles = useScaledStyles(baseStyles);
  return (
    <View>
      <View style={styles.footerRule} />
      <View style={styles.footerRow}>
        <Text style={styles.footerText}>{`Página ${number} de ${total}`}</Text>
        {canOlder && (
          <Pressable
            onPress={() => onTurn(1)}
            accessibilityRole="button"
            accessibilityLabel="Virar a página"
            style={({ pressed }) => [styles.footerTurn, pressed && styles.turnPressed]}>
            <Text style={styles.footerTurnText}>Virar a página ›</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.footer}>
        Jornal fictício de uma simulação independente, sem afiliação a qualquer órgão do governo brasileiro.
      </Text>
    </View>
  );
}

const serif = Fonts?.serif;

const baseStyles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: Paper.paperDeep,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: Paper.paperEdge,
    overflow: 'hidden',
  },
  // A página gira pela lombada (borda esquerda).
  page: { flex: 1, backgroundColor: Paper.paper, transformOrigin: 'left' },
  turnShade: { backgroundColor: '#000' },
  edgeTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 6, backgroundColor: 'rgba(120, 96, 52, 0.10)' },
  edgeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: 'rgba(120, 96, 52, 0.10)',
  },
  spine: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 5, backgroundColor: 'rgba(60, 44, 20, 0.14)' },
  topLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  topText: { fontFamily: serif, fontSize: 10, color: Paper.inkSoft, letterSpacing: 1.6, fontWeight: '700' },
  ruleThin: { height: 1, backgroundColor: Paper.rule, marginVertical: 2 },
  ruleDouble: { height: 5, borderTopWidth: 3, borderBottomWidth: 1, borderColor: Paper.rule },
  ruleThick: { height: 3, backgroundColor: Paper.rule, marginTop: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  titleBlock: { flex: 1, alignItems: 'center' },
  title: {
    alignSelf: 'stretch',
    textAlign: 'center',
    fontFamily: serif,
    fontWeight: '900',
    color: Paper.ink,
    letterSpacing: 0.5,
  },
  slogan: { fontFamily: serif, fontSize: 11, color: Paper.inkMuted, fontStyle: 'italic', letterSpacing: 0.8 },
  ear: {
    width: 112,
    borderWidth: 1,
    borderColor: Paper.rule,
    paddingHorizontal: 6,
    paddingVertical: 5,
    alignItems: 'center',
  },
  earTitle: { fontSize: 9, fontWeight: '800', letterSpacing: 1.4, color: Paper.accent },
  earLine: { fontFamily: serif, fontSize: 12, lineHeight: 15, color: Paper.ink, textAlign: 'center', marginTop: 2 },
  turn: {
    width: MIN_TOUCH,
    height: MIN_TOUCH,
    borderRadius: MIN_TOUCH / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Paper.ruleSoft,
  },
  turnOff: { opacity: 0.25 },
  turnPressed: { backgroundColor: Paper.paperEdge },
  turnText: { fontFamily: serif, fontSize: 26, lineHeight: 30, color: Paper.ink },
  dateRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  dateLine: { fontFamily: serif, fontSize: 12, color: Paper.inkSoft, fontStyle: 'italic' },
  sections: { gap: 16, paddingVertical: 6, paddingHorizontal: 2 },
  section: { minHeight: MIN_TOUCH, justifyContent: 'center' },
  sectionText: { fontSize: 11, fontWeight: '700', letterSpacing: 1.2, color: Paper.inkMuted },
  sectionOn: { color: Paper.accent },
  sectionBar: { height: 2, marginTop: 4, backgroundColor: 'transparent' },
  sectionBarOn: { backgroundColor: Paper.accent },
  empty: {
    fontFamily: serif,
    fontSize: 17,
    lineHeight: 25,
    color: Paper.inkSoft,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 28,
  },
  lead: { paddingTop: 6, paddingBottom: 4 },
  kicker: { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 6 },
  leadTitle: { fontFamily: serif, fontWeight: '900', color: Paper.ink, marginBottom: 8, letterSpacing: -0.3 },
  leadCause: {
    fontFamily: serif,
    fontSize: 16,
    lineHeight: 23,
    color: Paper.inkSoft,
    marginTop: 10,
    textAlign: 'justify',
  },
  dropCap: { fontFamily: serif, fontSize: 34, lineHeight: 23, fontWeight: '900', color: Paper.accent },
  byline: { fontSize: 12, color: Paper.inkMuted, marginTop: 8, fontStyle: 'italic' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, marginBottom: 2 },
  sectionHeaderRule: { flex: 1, height: 1, backgroundColor: Paper.rule },
  sectionHeaderText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.8, color: Paper.ink },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -10 },
  story: {
    paddingHorizontal: 10,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Paper.ruleSoft,
  },
  storyDivider: { borderRightWidth: StyleSheet.hairlineWidth },
  storyTitle: { fontFamily: serif, fontSize: 19, lineHeight: 23, fontWeight: '800', color: Paper.ink },
  storyTitleBig: { fontSize: 23, lineHeight: 27 },
  storyCause: {
    fontFamily: serif,
    fontSize: 14,
    lineHeight: 20,
    color: Paper.inkSoft,
    marginTop: 6,
    textAlign: 'justify',
  },
  bomb: { paddingTop: 10, gap: 10 },
  extraBand: {
    backgroundColor: Paper.extra,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  extraText: { color: '#fff7e8', fontSize: 14, fontWeight: '900', letterSpacing: 4 },
  bombTitle: {
    fontFamily: serif,
    fontWeight: '900',
    color: Paper.ink,
    textAlign: 'center',
    letterSpacing: -0.5,
    paddingVertical: 6,
  },
  bombDeck: {
    fontFamily: serif,
    fontSize: 18,
    lineHeight: 26,
    color: Paper.inkSoft,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  bombDeckBig: {
    fontSize: 22,
    lineHeight: 31,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Paper.rule,
    paddingVertical: 18,
    marginVertical: 6,
  },
  photoFrame: { borderWidth: 1, borderColor: Paper.rule, padding: 4, backgroundColor: Paper.paperDeep },
  photoClip: { aspectRatio: 16 / 10, overflow: 'hidden', backgroundColor: '#2a241c' },
  caption: { fontFamily: serif, fontSize: 12, color: Paper.inkMuted, fontStyle: 'italic', marginTop: 5 },
  continue: {
    alignSelf: 'center',
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Paper.rule,
    marginTop: 8,
  },
  continueText: { fontFamily: serif, fontSize: 14, fontWeight: '700', color: Paper.ink, letterSpacing: 0.4 },
  boxes: { gap: 12, marginTop: 20 },
  boxesRow: { flexDirection: 'row', flexWrap: 'wrap' },
  box: {
    flexGrow: 1,
    flexBasis: 220,
    borderWidth: 1,
    borderColor: Paper.rule,
    backgroundColor: '#ece2cc',
  },
  boxBand: { backgroundColor: Paper.rule, paddingHorizontal: 10, paddingVertical: 5 },
  boxBody: { padding: 12, gap: 4 },
  boxTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.6, color: '#f2ead8' },
  boxStrong: { fontFamily: serif, fontSize: 15, fontWeight: '700', color: Paper.ink },
  boxText: { fontFamily: serif, fontSize: 14, lineHeight: 20, color: Paper.ink },
  boxSmall: { fontSize: 12, color: Paper.inkMuted },
  bullet: { fontFamily: serif, fontSize: 14, lineHeight: 20, color: Paper.ink },
  footerRule: { height: 1, backgroundColor: Paper.rule, marginTop: 22 },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: MIN_TOUCH,
  },
  footerText: { fontFamily: serif, fontSize: 12, color: Paper.inkSoft, letterSpacing: 0.6 },
  footerTurn: { minHeight: MIN_TOUCH, justifyContent: 'center', paddingHorizontal: 8 },
  footerTurnText: { fontFamily: serif, fontSize: 14, fontWeight: '700', color: Paper.accent },
  footer: { fontSize: 11, color: Paper.inkMuted, textAlign: 'center', marginTop: 8, fontStyle: 'italic' },
});
