import { defineComponent, h } from 'vue'

const barStyle = {
  position: 'sticky',
  top: '0',
  zIndex: '10',
  display: 'flex',
  alignItems: 'center',
  height: '44px',
  padding: '0 12px',
  background: '#fff',
  borderBottom: '1px solid #e5e7eb',
} as const

/** 轻量导航栏：标题 + 可选返回按钮 */
export const NavBar = defineComponent({
  name: 'HydroNavBar',
  props: {
    title: { type: String, default: '' },
    showBack: { type: Boolean, default: true },
  },
  emits: ['back'],
  setup(props, { emit }) {
    return () =>
      h('header', { class: 'hydro-navbar', style: barStyle }, [
        props.showBack
          ? h(
              'button',
              {
                type: 'button',
                'aria-label': '返回',
                style: {
                  width: '32px',
                  height: '32px',
                  border: 'none',
                  background: 'transparent',
                  fontSize: '18px',
                  cursor: 'pointer',
                },
                onClick: () => emit('back'),
              },
              '‹',
            )
          : h('span', { style: { width: '32px' } }),
        h(
          'span',
          { style: { flex: '1', textAlign: 'center', fontSize: '16px', fontWeight: '600' } },
          props.title,
        ),
        h('span', { style: { width: '32px' } }),
      ])
  },
})
