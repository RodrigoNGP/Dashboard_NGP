import React from 'react'

const IcoList    = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
const IcoUsers   = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
const IcoTruck   = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
const IcoTag     = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
const IcoBank    = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><rect x="3" y="10" width="18" height="11" rx="1"/><path d="M12 2L2 7h20L12 2z"/><line x1="12" y1="10" x2="12" y2="21"/><line x1="7" y1="10" x2="7" y2="21"/><line x1="17" y1="10" x2="17" y2="21"/></svg>

export const financeiroNav = [
  { icon: <IcoList  />, label: 'Transações',   href: '/financeiro' },
  { icon: <IcoBank  />, label: 'Bancos e Carteiras', href: '/financeiro?tab=contas' },
  { icon: <IcoUsers />, label: 'Clientes',      href: '/financeiro?tab=clientes' },
  { icon: <IcoTruck />, label: 'Fornecedores',  href: '/financeiro?tab=fornecedores' },
  { icon: <IcoTag   />, label: 'Categorias',    href: '/financeiro?tab=categorias' },
]
