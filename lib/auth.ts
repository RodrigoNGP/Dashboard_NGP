import { Session } from '@/types'

// Chaves compatíveis com os HTML pages em /public
const KEYS = {
  auth:        'adsboard_auth',
  session:     'adsboard_session',
  user:        'adsboard_user',
  role:        'adsboard_role',
  username:    'adsboard_username',
  expires:     'adsboard_expires',
  metaAccount: 'adsboard_meta_account',
  foto:        'adsboard_foto',
}

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null
  try {
    const auth    = localStorage.getItem(KEYS.auth)
    const session = localStorage.getItem(KEYS.session)
    if (!auth || !session) return null

    const expires = localStorage.getItem(KEYS.expires) || ''
    if (expires && new Date(expires) < new Date()) {
      clearSession()
      return null
    }

    return {
      auth,
      session,
      user:        localStorage.getItem(KEYS.user)        || '',
      role:       (localStorage.getItem(KEYS.role)        || 'cliente') as 'ngp' | 'cliente',
      username:    localStorage.getItem(KEYS.username)    || '',
      expires,
      metaAccount: localStorage.getItem(KEYS.metaAccount) || undefined,
      foto:        localStorage.getItem(KEYS.foto)        || undefined,
    }
  } catch {
    return null
  }
}

export function setSession(data: Session) {
  localStorage.setItem(KEYS.auth,     data.auth)
  localStorage.setItem(KEYS.session,  data.session)
  localStorage.setItem(KEYS.user,     data.user)
  localStorage.setItem(KEYS.role,     data.role)
  localStorage.setItem(KEYS.username, data.username)
  localStorage.setItem(KEYS.expires,  data.expires)
  if (data.metaAccount) localStorage.setItem(KEYS.metaAccount, data.metaAccount)
  if (data.foto)        localStorage.setItem(KEYS.foto, data.foto)
}

export function clearSession() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k))
  localStorage.removeItem('ngp_viewing_account')
  localStorage.removeItem('ngp_viewing_name')
  localStorage.removeItem('ngp_viewing_username')
  localStorage.removeItem('ngp_viewing_id')
}

export function isAuthenticated(): boolean {
  return getSession()?.auth === '1'
}
