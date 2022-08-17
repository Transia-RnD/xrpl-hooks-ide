import Carbon from '../../components/icons/Carbon'
import Firewall from '../../components/icons/Firewall'
import Notary from '../../components/icons/Notary'
import Peggy from '../../components/icons/Peggy'
import Starter from '../../components/icons/Starter'

export const templateFileIds = {
  starter: {
    id: '9106f1fe60482d90475bfe8f1315affe',
    name: 'Starter',
    description:
      'Just a basic starter with essential imports, just accepts any transaction coming through',
    icon: Starter
  },
  firewall: {
    id: '1cc30f39c8a0b9c55b88c312669ca45e', // Forked
    name: 'Firewall',
    description: 'This Hook essentially checks a blacklist of accounts',
    icon: Firewall
  },
  notary: {
    id: '87b6f5a8c2f5038fb0f20b8b510efa10', // Forked
    name: 'Notary',
    description: 'Collecting signatures for multi-sign transactions',
    icon: Notary
  },
  carbon: {
    id: '5941c19dce3e147948f564e224553c02',
    name: 'Carbon',
    description: 'Send a percentage of sum to an address',
    icon: Carbon
  },
  peggy: {
    id: '049784a83fa068faf7912f663f7b6471', // Forked
    name: 'Peggy',
    description: 'An oracle based stable coin hook',
    icon: Peggy
  }
}

export const apiHeaderFiles = ['hookapi.h', 'sfcodes.h', 'macro.h', 'extern.h', 'error.h']
