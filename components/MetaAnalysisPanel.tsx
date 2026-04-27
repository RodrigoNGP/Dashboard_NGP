'use client'

import styles from './MetaAnalysisPanel.module.css'
import { buildMetaAnalysis } from '@/lib/meta-analysis'
import { fmt, fmtI, fmtN } from '@/lib/utils'
import { Campaign } from '@/types'

interface Props {
  campaigns: Campaign[]
  prevCampaigns?: Campaign[]
  periodLabel: string
  comparisonLabel?: string
  title?: string
}

type Tone = 'good' | 'warn' | 'bad' | 'neutral'

function formatDelta(delta: number | null) {
  if (delta === null || !Number.isFinite(delta)) return 'Sem comparativo'
  const signal = delta > 0 ? '+' : ''
  return `${signal}${delta.toFixed(1)}%`
}

function getDeltaTone(delta: number | null, lowerIsBetter = false): Tone {
  if (delta === null || !Number.isFinite(delta)) return 'neutral'
  if (delta === 0) return 'neutral'
  const improved = lowerIsBetter ? delta < 0 : delta > 0
  if (improved) return 'good'
  return Math.abs(delta) >= 15 ? 'bad' : 'warn'
}

function deltaClass(tone: Tone) {
  if (tone === 'good') return styles.deltaGood
  if (tone === 'bad') return styles.deltaBad
  if (tone === 'warn') return styles.deltaWarn
  return styles.deltaNeutral
}

function signalClass(tone: Exclude<Tone, 'neutral'> | 'neutral') {
  if (tone === 'good') return styles.signalToneGood
  if (tone === 'bad') return styles.signalToneBad
  if (tone === 'warn') return styles.signalToneWarn
  return ''
}

function insightClass(tone: Exclude<Tone, 'neutral'> | 'neutral') {
  if (tone === 'good') return styles.insightToneGood
  if (tone === 'bad') return styles.insightToneBad
  if (tone === 'warn') return styles.insightToneWarn
  return ''
}

function formatSummaryValue(kind: 'currency' | 'integer' | 'compact' | 'percent' | 'ratio', value: number) {
  if (kind === 'currency') return `R$ ${fmt(value)}`
  if (kind === 'integer') return fmtN(value)
  if (kind === 'compact') return fmtI(value)
  if (kind === 'percent') return `${value.toFixed(2)}%`
  return `${value.toFixed(2)}x`
}

function describeCtr(value: number) {
  if (value >= 1.5) return { tone: 'good' as const, hint: 'CTR saudável para manter escala e testar novas variações.' }
  if (value >= 0.9) return { tone: 'warn' as const, hint: 'CTR aceitável, mas ainda há espaço para ganhar tração criativa.' }
  return { tone: 'bad' as const, hint: 'CTR baixo. Vale revisar criativos, CTA e encaixe da oferta.' }
}

function describeCpc(value: number, delta: number | null) {
  const tone = delta !== null ? getDeltaTone(delta, true) : value <= 2 ? 'good' : value <= 4 ? 'warn' : 'bad'
  if (tone === 'good') return { tone, hint: 'Clique em faixa eficiente para testar mais volume com segurança.' }
  if (tone === 'warn') return { tone, hint: 'Clique ainda controlado, mas merece acompanhar frente ao CTR e ao funil.' }
  return { tone, hint: 'Clique caro para o recorte. Pode haver disputa alta ou criativo pouco aderente.' }
}

function describeFrequency(value: number) {
  if (value >= 3.2) return { tone: 'bad' as const, hint: 'Frequência alta. Há risco claro de saturação da audiência.' }
  if (value >= 2.2) return { tone: 'warn' as const, hint: 'Frequência moderada. Bom momento para preparar nova peça ou audiência.' }
  return { tone: 'good' as const, hint: 'Distribuição saudável. Ainda existe espaço antes de saturar o alcance.' }
}

function describeRoas(value: number) {
  if (value >= 2) return { tone: 'good' as const, hint: 'ROAS forte no recorte. Vale proteger esse núcleo de resultado.' }
  if (value >= 1) return { tone: 'warn' as const, hint: 'ROAS positivo, mas ainda pede ajuste fino para escalar com folga.' }
  return { tone: 'bad' as const, hint: 'ROAS baixo ou zerado. O investimento ainda não está devolvendo na mesma intensidade.' }
}

function describeConversionRate(value: number) {
  if (value >= 10) return { tone: 'good' as const, hint: 'A passagem de clique para resultado está eficiente no funil atual.' }
  if (value >= 4) return { tone: 'warn' as const, hint: 'Conversão razoável. Landing, oferta ou lead form ainda podem render mais.' }
  return { tone: 'bad' as const, hint: 'Conversão baixa. O gargalo pode estar depois do clique, e não só no anúncio.' }
}

export default function MetaAnalysisPanel({
  campaigns,
  prevCampaigns = [],
  periodLabel,
  comparisonLabel,
  title = 'Leitura Analítica Meta Ads',
}: Props) {
  if (campaigns.length === 0) return null

  const analysis = buildMetaAnalysis(campaigns, prevCampaigns)
  const { current, previous, deltas, topCampaigns, opportunity, attention, concentration, headline } = analysis

  const summaryCards = [
    {
      label: 'Investimento',
      value: formatSummaryValue('currency', current.spend),
      previous: previous ? formatSummaryValue('currency', previous.spend) : null,
      delta: deltas.spend,
      lowerIsBetter: false,
    },
    {
      label: 'Impressões',
      value: formatSummaryValue('compact', current.impressions),
      previous: previous ? formatSummaryValue('compact', previous.impressions) : null,
      delta: deltas.impressions,
      lowerIsBetter: false,
    },
    {
      label: 'Cliques',
      value: formatSummaryValue('integer', current.clicks),
      previous: previous ? formatSummaryValue('integer', previous.clicks) : null,
      delta: deltas.clicks,
      lowerIsBetter: false,
    },
    {
      label: 'CTR',
      value: formatSummaryValue('percent', current.ctr),
      previous: previous ? formatSummaryValue('percent', previous.ctr) : null,
      delta: deltas.ctr,
      lowerIsBetter: false,
    },
    {
      label: 'CPC médio',
      value: formatSummaryValue('currency', current.cpc),
      previous: previous ? formatSummaryValue('currency', previous.cpc) : null,
      delta: deltas.cpc,
      lowerIsBetter: true,
    },
    {
      label: 'CPM',
      value: formatSummaryValue('currency', current.cpm),
      previous: previous ? formatSummaryValue('currency', previous.cpm) : null,
      delta: deltas.cpm,
      lowerIsBetter: true,
    },
  ]

  const supportMetrics = [
    {
      label: 'Conversas',
      value: fmtN(current.conversations),
      hint: previous ? `${formatDelta(deltas.conversations)} vs comparativo` : 'Volume gerado por mensagem no recorte.',
    },
    {
      label: 'Leads',
      value: fmtN(current.leads),
      hint: previous ? `${formatDelta(deltas.leads)} vs comparativo` : 'Cadastros captados na operação atual.',
    },
    {
      label: 'Compras',
      value: fmtN(current.purchases),
      hint: previous ? `${formatDelta(deltas.purchases)} vs comparativo` : 'Compras atribuídas ao período carregado.',
    },
    {
      label: 'ROAS',
      value: `${current.roas.toFixed(2)}x`,
      hint: current.revenue > 0 ? `Receita atribuída: R$ ${fmt(current.revenue)}` : 'Sem receita atribuída neste recorte.',
    },
    {
      label: current.leads > 0 ? 'CPL' : 'Custo por resultado',
      value: current.leads > 0 ? `R$ ${fmt(current.costPerLead)}` : `R$ ${fmt(current.costPerResult)}`,
      hint: current.leads > 0 ? 'Quanto custa gerar cada lead no período.' : 'Custo médio do resultado principal carregado.',
    },
    {
      label: 'Taxa de conversão',
      value: `${current.conversionRate.toFixed(2)}%`,
      hint: 'Relação entre cliques e resultado principal do recorte.',
    },
  ]

  const ctrSignal = describeCtr(current.ctr)
  const cpcSignal = describeCpc(current.cpc, deltas.cpc)
  const frequencySignal = describeFrequency(current.frequency)
  const roasSignal = describeRoas(current.roas)
  const conversionSignal = describeConversionRate(current.conversionRate)
  const costSignalTone =
    current.leads > 0
      ? getDeltaTone(deltas.costPerLead, true)
      : getDeltaTone(deltas.costPerResult, true)

  const signals = [
    {
      label: 'CTR',
      value: `${current.ctr.toFixed(2)}%`,
      hint: ctrSignal.hint,
      tone: ctrSignal.tone,
    },
    {
      label: 'CPC médio',
      value: `R$ ${fmt(current.cpc)}`,
      hint: cpcSignal.hint,
      tone: cpcSignal.tone,
    },
    {
      label: 'Frequência',
      value: `${current.frequency.toFixed(2)}x`,
      hint: frequencySignal.hint,
      tone: frequencySignal.tone,
    },
    {
      label: 'ROAS',
      value: `${current.roas.toFixed(2)}x`,
      hint: roasSignal.hint,
      tone: roasSignal.tone,
    },
    {
      label: current.leads > 0 ? 'CPL' : 'Custo por resultado',
      value: current.leads > 0 ? `R$ ${fmt(current.costPerLead)}` : `R$ ${fmt(current.costPerResult)}`,
      hint: current.leads > 0 ? 'Leitura direta do custo por lead.' : 'Leitura do custo do principal resultado carregado.',
      tone: costSignalTone === 'neutral' ? 'warn' : costSignalTone,
    },
    {
      label: 'Conversão',
      value: `${current.conversionRate.toFixed(2)}%`,
      hint: conversionSignal.hint,
      tone: conversionSignal.tone,
    },
  ]

  const funnelSteps = [
    { label: 'Alcance', value: current.reach, display: fmtI(current.reach) },
    { label: 'Impressões', value: current.impressions, display: fmtI(current.impressions) },
    { label: 'Cliques', value: current.clicks, display: fmtN(current.clicks) },
    { label: current.primaryResultLabel, value: current.primaryResults, display: fmtN(current.primaryResults) },
  ]

  const funnelMax = Math.max(...funnelSteps.map((step) => step.value), 1)
  const clickRate = current.impressions > 0 ? (current.clicks / current.impressions) * 100 : 0
  const resultRate = current.clicks > 0 ? (current.primaryResults / current.clicks) * 100 : 0
  const resultsPerThousand = current.impressions > 0 ? (current.primaryResults / current.impressions) * 1000 : 0

  const opportunityTone: Tone =
    opportunity && opportunity.primaryResults > 0 ? 'good' : opportunity && opportunity.clicks > 0 ? 'warn' : 'neutral'
  const attentionTone: Tone =
    attention && attention.primaryResults === 0 && attention.spend > 0
      ? 'bad'
      : attention && attention.frequency >= 3.2
        ? 'warn'
        : 'neutral'
  const concentrationTone: Tone =
    concentration.top3Share >= 75 ? 'bad' : concentration.top3Share >= 55 ? 'warn' : 'good'

  return (
    <section className={styles.panel}>
      <div className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>
            <span className={styles.eyebrowDot} />
            Meta Ads Intelligence
          </div>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.headline}>{headline}</p>
        </div>

        <div className={styles.heroMeta}>
          <span className={styles.metaPill}>
            <span className={styles.metaPillLabel}>Período</span>
            {periodLabel}
          </span>
          {previous && comparisonLabel && (
            <span className={styles.metaPill}>
              <span className={styles.metaPillLabel}>Comparação</span>
              {comparisonLabel}
            </span>
          )}
        </div>
      </div>

      <div className={styles.body}>
        <h3 className={styles.sectionTitle}>Resumo consolidado</h3>
        <div className={styles.summaryGrid}>
          {summaryCards.map((card) => {
            const tone = getDeltaTone(card.delta, card.lowerIsBetter)
            return (
              <article key={card.label} className={styles.summaryCard}>
                <div className={styles.summaryLabel}>{card.label}</div>
                <div className={styles.summaryValue}>{card.value}</div>
                <div className={styles.summaryFoot}>
                  <span className={styles.summaryPrev}>
                    {card.previous ? `${card.previous} no comparativo` : 'Sem comparativo carregado'}
                  </span>
                  <span className={`${styles.delta} ${deltaClass(tone)}`}>{formatDelta(card.delta)}</span>
                </div>
              </article>
            )
          })}
        </div>

        <div className={styles.supportGrid}>
          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>Resultados principais</h3>
            <div className={styles.supportMetrics}>
              {supportMetrics.map((metric) => (
                <article key={metric.label} className={styles.supportMetric}>
                  <div className={styles.supportLabel}>{metric.label}</div>
                  <div className={styles.supportValue}>{metric.value}</div>
                  <div className={styles.supportHint}>{metric.hint}</div>
                </article>
              ))}
            </div>
          </div>

          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>Funil de performance</h3>
            <div className={styles.funnelList}>
              {funnelSteps.map((step) => (
                <div key={step.label} className={styles.funnelStep}>
                  <div className={styles.funnelLabel}>{step.label}</div>
                  <div className={styles.funnelTrack}>
                    <div
                      className={styles.funnelFill}
                      style={{ width: `${Math.max(8, (step.value / funnelMax) * 100)}%` }}
                    />
                  </div>
                  <div className={styles.funnelValue}>{step.display}</div>
                </div>
              ))}
            </div>

            <div className={styles.funnelMeta}>
              <span className={styles.funnelMetaPill}>CTR real: {clickRate.toFixed(2)}%</span>
              <span className={styles.funnelMetaPill}>Clique → {current.primaryResultLabel}: {resultRate.toFixed(2)}%</span>
              <span className={styles.funnelMetaPill}>{resultsPerThousand.toFixed(2)} resultados por mil impressões</span>
            </div>
          </div>
        </div>

        <div className={styles.duoGrid}>
          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>Radar do período</h3>
            <div className={styles.signalGrid}>
              {signals.map((signal) => (
                <article key={signal.label} className={`${styles.signalCard} ${signalClass(signal.tone)}`}>
                  <div className={styles.signalLabel}>{signal.label}</div>
                  <div className={styles.signalValue}>{signal.value}</div>
                  <div className={styles.signalHint}>{signal.hint}</div>
                </article>
              ))}
            </div>
          </div>

          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>Campanhas em destaque</h3>
            <div className={styles.rankingList}>
              {topCampaigns.slice(0, 5).map((campaign) => (
                <article key={campaign.id} className={styles.rankingItem}>
                  <div className={styles.rankingTop}>
                    <div className={styles.rankingName}>{campaign.name}</div>
                    <div className={styles.rankingSpend}>R$ {fmt(campaign.spend)}</div>
                  </div>
                  <div className={styles.rankingMeta}>
                    <span>{campaign.spendShare.toFixed(1)}% da verba</span>
                    <span>{campaign.primaryResults} {campaign.primaryResultLabel.toLowerCase()}</span>
                    <span>{campaign.ctr.toFixed(2)}% CTR</span>
                    <span>R$ {fmt(campaign.cpc)} CPC</span>
                  </div>
                  <div className={styles.shareTrack}>
                    <div className={styles.shareFill} style={{ width: `${Math.max(6, campaign.spendShare)}%` }} />
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.duoGrid} style={{ marginTop: 14 }}>
          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>Leitura de alocação</h3>
            <div className={styles.insightStack}>
              <article className={`${styles.insightCard} ${insightClass(opportunityTone)}`}>
                <div className={styles.insightEyebrow}>Melhor oportunidade</div>
                <div className={styles.insightValue}>
                  {opportunity ? opportunity.name : 'Sem oportunidade clara no recorte'}
                </div>
                <div className={styles.insightDetail}>
                  {opportunity
                    ? `${opportunity.primaryResults} ${opportunity.primaryResultLabel.toLowerCase()} com R$ ${fmt(opportunity.spend)} investidos e ${opportunity.spendShare.toFixed(1)}% da verba.`
                    : 'É preciso mais volume de dados para destacar uma campanha com segurança.'}
                </div>
              </article>

              <article className={`${styles.insightCard} ${insightClass(attentionTone)}`}>
                <div className={styles.insightEyebrow}>Ponto de atenção</div>
                <div className={styles.insightValue}>
                  {attention ? attention.name : 'Sem alerta relevante no recorte'}
                </div>
                <div className={styles.insightDetail}>
                  {attention
                    ? `${attention.primaryResults > 0 ? `${attention.primaryResults} ${attention.primaryResultLabel.toLowerCase()}` : 'Sem resultado principal'} · R$ ${fmt(attention.spend)} investidos · frequência ${attention.frequency.toFixed(2)}x.`
                    : 'Nenhuma campanha com gasto relevante apareceu como gargalo importante neste período.'}
                </div>
              </article>
            </div>
          </div>

          <div className={styles.card}>
            <h3 className={styles.sectionTitle}>Concentração e cobertura</h3>
            <div className={styles.insightStack}>
              <article className={`${styles.insightCard} ${insightClass(concentrationTone)}`}>
                <div className={styles.insightEyebrow}>Concentração de verba</div>
                <div className={styles.insightValue}>
                  {concentration.top1Share.toFixed(1)}% na principal campanha
                </div>
                <div className={styles.insightDetail}>
                  {concentration.dominantCampaign
                    ? `${concentration.dominantCampaign.name} lidera o recorte. As 3 maiores campanhas concentram ${concentration.top3Share.toFixed(1)}% do investimento.`
                    : 'Ainda não há verba suficiente distribuída para medir concentração com clareza.'}
                </div>
              </article>

              <article className={`${styles.insightCard} ${insightClass(frequencySignal.tone)}`}>
                <div className={styles.insightEyebrow}>Cobertura de mídia</div>
                <div className={styles.insightValue}>
                  {fmtI(current.reach)} de alcance com frequência {current.frequency.toFixed(2)}x
                </div>
                <div className={styles.insightDetail}>
                  {frequencySignal.hint} O recorte carrega {current.activeCampaigns} campanha(s) ativa(s) e {current.pausedCampaigns} fora de veiculação.
                </div>
              </article>
            </div>
          </div>
        </div>

        <div className={styles.footerStrip}>
          <span className={styles.footerPill}>{current.campaignCount} campanhas no recorte</span>
          <span className={styles.footerPill}>R$ {fmt(current.spend)} investidos</span>
          <span className={styles.footerPill}>{fmtI(current.impressions)} impressões</span>
          <span className={styles.footerPill}>{fmtN(current.clicks)} cliques</span>
          <span className={styles.footerPill}>{fmtN(current.primaryResults)} {current.primaryResultLabel.toLowerCase()}</span>
        </div>
      </div>
    </section>
  )
}
