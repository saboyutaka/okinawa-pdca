// ページごとの SNS のカードの画像（/og/shisaku/1-1-a-1.png など。og:image は layouts/Base.astro）。中身は lib/card.ts、PNG にするのは lib/card-render.ts
import type { InferGetStaticPropsType } from 'astro';
import { getCards } from '../../lib/card.ts';
import { renderCard } from '../../lib/card-render.ts';

export const getStaticPaths = () => [...getCards().values()].map((c) => ({ params: { card: c.page.slice(1, -1) }, props: { c } }));
type Props = InferGetStaticPropsType<typeof getStaticPaths>;

export const GET = async ({ props }: { props: Props }) =>
  new Response(new Uint8Array(await renderCard(props.c.node())), { headers: { 'Content-Type': 'image/png' } });
