import { defineComponent, h, type PropType } from 'vue'

const containerStyle = {
  position: 'fixed',
  left: '50%',
  transform: 'translateX(-50%)',
  zIndex: '9999',
  maxWidth: '70vw',
  padding: '10px 16px',
  borderRadius: '8px',
  background: 'rgba(17, 24, 39, 0.88)',
  color: '#fff',
  fontSize: '14px',
  lineHeight: '1.4',
  textAlign: 'center',
  pointerEvents: 'none',
} as const

const positionStyle = {
  top: { top: '15%' },
  center: { top: '50%', transform: 'translate(-50%, -50%)' },
  bottom: { bottom: '15%' },
} as const

/** 轻提示（无第三方依赖，样式内联） */
export const Toast = defineComponent({
  name: 'HydroToast',
  props: {
    message: { type: String, default: '' },
    visible: { type: Boolean, default: false },
    position: {
      type: String as PropType<'top' | 'center' | 'bottom'>,
      default: 'center',
    },
  },
  setup(props) {
    return () =>
      props.visible
        ? h(
            'div',
            {
              class: 'hydro-toast',
              style: { ...containerStyle, ...positionStyle[props.position] },
            },
            props.message,
          )
        : null
  },
})
