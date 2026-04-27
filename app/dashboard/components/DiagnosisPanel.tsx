import React from 'react'
import { fmt, fmtN } from '@/lib/utils'

interface DiagnosisPanelProps {
  analyticsSnapshot: any
  snapshotDisplay: any
  loadedAds: any[]
  bestAd: any
  worstAd: any
}

export default function DiagnosisPanel({ analyticsSnapshot, snapshotDisplay, loadedAds, bestAd, worstAd }: DiagnosisPanelProps) {
  if (!analyticsSnapshot) return null

  return (
    <div style={{ background: 'linear-gradient(180deg, #fff 0%, #fff7f7 100%)', border: '1px solid #F2D6D6', borderRadius: 12, padding: 18, marginTop: 20, boxShadow: '0 1px 2px rgba(0,0,0,.03)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--report-primary)', textTransform: 'uppercase', letterSpacing: '.08em' }}>Diagnóstico do período</div>
          <div style={{ fontSize: 14, color: '#6E6E73', marginTop: 4 }}>{analyticsSnapshot.diagnosis.headline}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { label: 'CTR', value: `${analyticsSnapshot.summary.ctr.toFixed(2)}%`, delta: snapshotDisplay?.ctrDelta },
            { label: 'CPC', value: `R$ ${fmt(analyticsSnapshot.summary.cpc)}`, delta: snapshotDisplay?.cpcDelta },
            { label: 'Frequência', value: `${analyticsSnapshot.summary.frequency.toFixed(2)}x`, delta: snapshotDisplay?.frequencyDelta },
            { label: analyticsSnapshot.summary.primaryResultLabel, value: fmtN(analyticsSnapshot.summary.primaryResults), delta: snapshotDisplay?.resultsDelta },
          ].map(signal => (
            <div key={signal.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: '#fff', border: '1px solid #EFE7E7' }}>
              <span style={{ fontSize: 10, color: '#8E8E93', fontWeight: 700, textTransform: 'uppercase' }}>{signal.label}</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#111' }}>{signal.value}</span>
              {signal.delta && (
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 5px', borderRadius: 6, background: signal.delta.startsWith('+') ? '#dcfce7' : '#fee2e2', color: signal.delta.startsWith('+') ? '#15803d' : '#dc2626' }}>
                  {signal.delta}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {analyticsSnapshot.diagnosis.signals.map((card: any) => {
          const toneColor = card.tone === 'bad' ? '#CC1414' : card.tone === 'warn' ? '#B45309' : card.tone === 'good' ? '#15803d' : '#64748b'
          const toneBorder = card.tone === 'bad' ? '#F3B0B0' : card.tone === 'warn' ? '#F2D38F' : card.tone === 'good' ? '#D7E8D7' : '#E5E7EB'
          return (
            <div key={card.title} style={{ background: '#fff', border: `1px solid ${toneBorder}`, borderRadius: 10, padding: 14, minHeight: 124 }}>
              <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em', color: toneColor }}>{card.title}</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#111', lineHeight: 1.2, marginTop: 8 }}>{card.value}</div>
              <div style={{ fontSize: 12, color: '#6E6E73', marginTop: 8, lineHeight: 1.45 }}>{card.detail}</div>
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 12, borderRadius: 10, border: '1px solid #F0E1E1', background: '#fff', padding: '12px 14px' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: '#6E6E73', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 8 }}>Leitura de criativos</div>
        {loadedAds.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            <div style={{ fontSize: 12, color: '#6E6E73', lineHeight: 1.45 }}>
              <strong style={{ color: '#111' }}>Melhor criativo:</strong>{' '}
              {bestAd ? `${bestAd.name} · ${bestAd.ctr.toFixed(2)}% CTR · R$ ${fmt(bestAd.spend)}` : 'Sem destaque claro.'}
            </div>
            <div style={{ fontSize: 12, color: '#6E6E73', lineHeight: 1.45 }}>
              <strong style={{ color: '#111' }}>Criativo de atenção:</strong>{' '}
              {worstAd ? `${worstAd.name} · ${worstAd.clicks} clique(s) · R$ ${fmt(worstAd.spend)}` : 'Sem criativo problemático carregado.'}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 12, color: '#6E6E73', lineHeight: 1.45 }}>Os anúncios ainda não foram carregados nesta conta/período.</div>
        )}
      </div>
    </div>
  )
}
