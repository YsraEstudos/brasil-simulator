import { memo, useMemo, useState, type ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { Hud } from '@/components/painel/hudTheme';
import { MIN_TOUCH } from '@/constants/theme';
import { useScaledStyles } from '@/hooks/use-scaled-styles';
import type { NewsKind } from '@/engine';

import { compactCount, emptySocialMessage, moodOf, trendsOf, type PostStance, type SocialPost } from './socialFeed';

/** Nome da rede social fictícia da mesa. */
export const SOCIAL_NAME = 'Praça';

const STANCE_LABEL: Record<PostStance, string> = { apoio: 'Apoio', critica: 'Crítica', neutra: 'Neutra' };
const STANCE_COLOR: Record<PostStance, string> = { apoio: Hud.positive, critica: Hud.negative, neutra: Hud.neutral };
/** Coração como texto (o seletor U+FE0E impede o Android de trocá-lo por emoji colorido). */
const HEART = '\u2665\uFE0E';
/** Só as primeiras publicações entram em cascata: o resto da lista rola sem custo extra. */
const ANIMATED_POSTS = 8;

/**
 * Tela do notebook: a rede social fictícia com reações às manchetes. Lista virtualizada (FlatList) para rolar
 * leve em aparelhos modestos; o humor da rede (apoio × crítica) fica numa barra no topo.
 */
export function SocialScreen({
  posts,
  onBack,
  progress,
  newsOff,
}: {
  posts: readonly SocialPost[];
  onBack: () => void;
  /** Quanto a tela já "acendeu" (0–1): as primeiras publicações sobem em cascata junto. */
  progress: SharedValue<number>;
  /** Módulo de notícias desligado nesta campanha: sem manchetes, ninguém publica nunca. */
  newsOff: boolean;
}) {
  const styles = useScaledStyles(baseStyles);
  const [kind, setKind] = useState<NewsKind | null>(null);
  const trends = useMemo(() => trendsOf(posts), [posts]);
  // A tela fica montada entre visitas: um assunto que saiu das notícias recentes deixa de filtrar (senão a
  // lista ficaria vazia, com a mensagem de "ninguém comentando").
  const activeKind = kind && trends.some((t) => t.kind === kind) ? kind : null;
  const visible = useMemo(() => (activeKind ? posts.filter((p) => p.kind === activeKind) : posts), [posts, activeKind]);
  // O humor acompanha o filtro: é o clima do assunto que está na tela.
  const mood = useMemo(() => moodOf(visible), [visible]);

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable
          onPress={onBack}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Voltar para a mesa"
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Text style={styles.backText}>‹ Mesa</Text>
        </Pressable>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>P</Text>
          </View>
          <Text style={styles.brandName}>{SOCIAL_NAME}</Text>
        </View>
        <Text style={styles.fiction}>rede fictícia</Text>
      </View>

      <MoodBar mood={mood} />

      <View style={styles.trends}>
        <TrendChip label="Tudo" selected={activeKind === null} onPress={() => setKind(null)} />
        {trends.map((t) => (
          <TrendChip
            key={t.kind}
            label={`${t.tag} · ${t.posts}`}
            selected={activeKind === t.kind}
            onPress={() => setKind(activeKind === t.kind ? null : t.kind)}
          />
        ))}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(p) => p.id}
        renderItem={({ item, index }) => <Post post={item} index={index} progress={progress} />}
        contentContainerStyle={styles.list}
        initialNumToRender={6}
        windowSize={5}
        ListEmptyComponent={<Text style={styles.empty}>{emptySocialMessage(newsOff)}</Text>}
      />
    </View>
  );
}

function MoodBar({ mood }: { mood: Record<PostStance, number> }) {
  const styles = useScaledStyles(baseStyles);
  const stances: PostStance[] = ['apoio', 'neutra', 'critica'];
  const empty = mood.apoio + mood.critica + mood.neutra === 0;
  return (
    <View
      style={styles.mood}
      accessibilityLabel={`Humor da rede: ${Math.round(mood.apoio * 100)}% de apoio e ${Math.round(mood.critica * 100)}% de crítica`}>
      <View style={styles.moodBar}>
        {!empty &&
          stances.map((s) => (
            <View key={s} style={{ flex: Math.max(0.001, mood[s]), backgroundColor: STANCE_COLOR[s] }} />
          ))}
      </View>
      <View style={styles.moodLegend}>
        {stances.map((s) => (
          <Text key={s} style={styles.moodText}>
            <Text style={{ color: STANCE_COLOR[s] }}>● </Text>
            {`${STANCE_LABEL[s]} ${Math.round(mood[s] * 100)}%`}
          </Text>
        ))}
      </View>
    </View>
  );
}

function TrendChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const styles = useScaledStyles(baseStyles);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[styles.chip, selected && styles.chipOn]}>
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const Post = memo(function Post({
  post,
  index,
  progress,
}: {
  post: SocialPost;
  index: number;
  progress: SharedValue<number>;
}) {
  const styles = useScaledStyles(baseStyles);
  const { author } = post;
  const body = (
    <View style={styles.post}>
      <View style={[styles.avatar, { backgroundColor: author.color }]}>
        <Text style={styles.avatarText}>{author.initials}</Text>
      </View>
      <View style={styles.postBody}>
        <View style={styles.postHead}>
          <Text style={styles.name} numberOfLines={1}>
            {author.name}
            {author.verified && <Text style={styles.verified}>{'  ✦'}</Text>}
          </Text>
          <Text style={styles.when}>{post.when}</Text>
        </View>
        <Text style={styles.handle} numberOfLines={1}>
          {author.role ? `${author.handle} · ${author.role}` : author.handle}
        </Text>
        <Text style={styles.text}>{post.text}</Text>
        <View style={styles.actions}>
          <Text style={styles.action}>{`↩ ${compactCount(post.replies)}`}</Text>
          <Text style={styles.action}>{`⇄ ${compactCount(post.shares)}`}</Text>
          <Text style={styles.action}>{`${HEART} ${compactCount(post.likes)}`}</Text>
          <Text style={[styles.stance, { color: STANCE_COLOR[post.stance], borderColor: STANCE_COLOR[post.stance] }]}>
            {STANCE_LABEL[post.stance]}
          </Text>
        </View>
      </View>
    </View>
  );
  if (index >= ANIMATED_POSTS) return body;
  return (
    <Rise index={index} progress={progress}>
      {body}
    </Rise>
  );
});

/** Cascata na thread de UI: cada publicação sobe um pouco depois da anterior enquanto a tela acende. */
function Rise({ index, progress, children }: { index: number; progress: SharedValue<number>; children: ReactNode }) {
  const start = index * 0.07;
  const style = useAnimatedStyle(() => {
    const t = interpolate(progress.value, [start, start + 0.45], [0, 1], 'clamp');
    return { opacity: t, transform: [{ translateY: (1 - t) * 18 }] };
  });
  return <Animated.View style={style}>{children}</Animated.View>;
}

const baseStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b1410' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Hud.divider,
    backgroundColor: '#0f1b15',
  },
  back: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: 10,
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Hud.glassBorder,
  },
  pressed: { opacity: 0.7 },
  backText: { color: Hud.titleBright, fontWeight: '700', fontSize: 14 },
  brand: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: Hud.title,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { color: '#0b1410', fontWeight: '900', fontSize: 15 },
  brandName: { color: Hud.text, fontWeight: '800', fontSize: 18, letterSpacing: 0.3 },
  fiction: { color: Hud.textMuted, fontSize: 11 },
  mood: { paddingHorizontal: 12, paddingTop: 10, gap: 6 },
  moodBar: { height: 6, borderRadius: 3, overflow: 'hidden', flexDirection: 'row', backgroundColor: Hud.track },
  moodLegend: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  moodText: { color: Hud.textDim, fontSize: 11 },
  trends: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingVertical: 10 },
  chip: {
    minHeight: 32,
    paddingHorizontal: 10,
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Hud.tileBorder,
    backgroundColor: Hud.tile,
  },
  chipOn: { borderColor: Hud.title, backgroundColor: '#3a3215' },
  chipText: { color: Hud.textDim, fontSize: 12, fontWeight: '600' },
  chipTextOn: { color: Hud.titleBright },
  list: { paddingHorizontal: 10, paddingBottom: 16, gap: 8, width: '100%', maxWidth: 720, alignSelf: 'center' },
  empty: { color: Hud.textDim, textAlign: 'center', padding: 24, lineHeight: 20 },
  post: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#111d17',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Hud.tileBorder,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  postBody: { flex: 1, gap: 2 },
  postHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, color: Hud.text, fontWeight: '700', fontSize: 14 },
  verified: { color: Hud.titleBright, fontSize: 12 },
  when: { color: Hud.textMuted, fontSize: 12 },
  handle: { color: Hud.textMuted, fontSize: 12 },
  text: { color: Hud.text, fontSize: 14, lineHeight: 20, marginTop: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 },
  action: { color: Hud.textDim, fontSize: 12 },
  stance: {
    marginLeft: 'auto',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderRadius: 6,
    overflow: 'hidden',
  },
});
