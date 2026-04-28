'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/lib/auth'
import styles from './SettingsModal.module.css'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

const MASTER_USERNAMES = ['arthur', 'arthur.oliveira@sejangp.com.br']

interface SettingsSection {
  title: string
  items: {
    icon: string
    label: string
    description: string
    href: string
    masterOnly?: boolean
    adminOnly?: boolean
  }[]
}

const SETTINGS_SECTIONS: SettingsSection[] = [
  {
    title: 'Cadastros',
    items: [
      {
        icon: '👥',
        label: 'Central de Clientes',
        description: 'Gerencie clientes, portais e acessos CRM',
        href: '/admin/usuarios?tab=clientes',
        adminOnly: true,
      },
      {
        icon: '🧑‍💼',
        label: 'Usuários da NGP',
        description: 'Cadastre e gerencie colaboradores internos',
        href: '/admin/usuarios?tab=usuarios-ngp',
        adminOnly: true,
      },
    ],
  },
  {
    title: 'Sistema',
    items: [
      {
        icon: '💳',
        label: 'Contas',
        description: 'Gerencie contas e planos do sistema',
        href: '/admin/contas',
        adminOnly: true,
      },
      {
        icon: '🔗',
        label: 'Link de Contas',
        description: 'Vincule e integre contas externas',
        href: '/admin/link-accounts',
        adminOnly: true,
      },
    ],
  },
  {
    title: 'Controle de Acesso',
    items: [
      {
        icon: '🔒',
        label: 'Setores Restritos',
        description: 'Gerencie quem pode acessar setores sigilosos',
        href: '/admin/usuarios?tab=usuarios-ngp',
        masterOnly: true,
      },
    ],
  },
]

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const router = useRouter()
  const [sess, setSess] = useState<ReturnType<typeof getSession> | null>(null)

  useEffect(() => {
    setSess(getSession())
  }, [isOpen])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen || !sess) return null

  const isAdmin = sess.role === 'admin'
  const isMaster = isAdmin && MASTER_USERNAMES.includes(sess.username ?? '')

  function navigate(href: string) {
    onClose()
    router.push(href)
  }

  const visibleSections = SETTINGS_SECTIONS.map(section => ({
    ...section,
    items: section.items.filter(item => {
      if (item.masterOnly) return isMaster
      if (item.adminOnly) return isAdmin
      return true
    }),
  })).filter(s => s.items.length > 0)

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <div className={styles.gearIcon}>⚙</div>
            <div>
              <div className={styles.title}>Configurações</div>
              <div className={styles.subtitle}>Gerencie o sistema NGP Space</div>
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Fechar">✕</button>
        </div>

        <div className={styles.body}>
          {visibleSections.length === 0 ? (
            <div className={styles.empty}>Nenhuma configuração disponível para seu perfil.</div>
          ) : (
            visibleSections.map(section => (
              <div key={section.title} className={styles.section}>
                <div className={styles.sectionTitle}>{section.title}</div>
                <div className={styles.grid}>
                  {section.items.map(item => (
                    <button
                      key={item.href + item.label}
                      className={styles.card}
                      onClick={() => navigate(item.href)}
                    >
                      <div className={styles.cardIcon}>{item.icon}</div>
                      <div className={styles.cardContent}>
                        <div className={styles.cardLabel}>{item.label}</div>
                        <div className={styles.cardDesc}>{item.description}</div>
                      </div>
                      <div className={styles.cardArrow}>→</div>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.footerInfo}>
            Logado como <strong>{sess.user}</strong> · {isMaster ? 'ADM Master' : isAdmin ? 'Administrador' : 'NGP'}
          </div>
        </div>
      </div>
    </div>
  )
}
