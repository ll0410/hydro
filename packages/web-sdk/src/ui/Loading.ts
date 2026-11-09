import { defineComponent, h } from 'vue'

const overlayStyle = {
  position: 'fixed',
  inset: '0',
  zIndex: '9998',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(0, 0, 0, 0.18)',
} as const

const spinnerStyle = {
  width: '28px',
  height: '28px',
  border: '3px solid rgba(37, 99, 235, 0.2)',
  borderTopColor: '#2563eb',
  borderRadius: '50%',
} as const

/** 全屏 Loading 遮罩 */
export const Loading = defineComponent({
  name: 'HydroLoading',
  props: {
    visible: { type: Boolean, default: false },
    text: { type: String, default: '' },
  },
  setup(props) {
    return () =>
      props.visible
        ? h('div', { class: 'hydro-loading', style: overlayStyle }, [
            h('div', { style: { textAlign: 'center', color: '#fff', fontSize: '13px' } }, [
              h('div', {
                class: 'hydro-loading__spinner',
                style: { ...spinnerStyle, margin: '0 auto' },
              }),
              props.text ? h('div', { style: { marginTop: '8px' } }, props.text) : null,
            ]),
          ])
        : null
  },
})
