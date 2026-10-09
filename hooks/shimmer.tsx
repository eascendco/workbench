// A file name with a band of light sweeping across it: the file Claude is reading or editing right now.
// It ticks on the surface's frame clock, so the pane need not redraw.
import type { ClientModule } from 'claude-code'

type Props = { text: string; color: string; shine: string }
type State = { at: number }

/** Characters lit at once, and the pause after a sweep before the next. */
const BAND = 3
const GAP = 6

const Shimmer: ClientModule<Props, State> = (props, surface) => {
  const { Text } = surface.elements
  const at = surface.state?.at ?? 0
  if (surface.state === undefined) {
    surface.setState({ at: 0 })
    surface.every(80, () => {
      const cur = surface.state?.at ?? 0
      surface.setState({ at: (cur + 1) % (props.text.length + BAND + GAP) })
    })
  }
  const from = Math.max(0, at - BAND)
  const head = props.text.slice(0, from)
  const lit = props.text.slice(from, at)
  const tail = props.text.slice(at)
  return (
    <Text bold wrap="truncate-end">
      <Text color={props.color}>{head}</Text>
      <Text color={props.shine}>{lit}</Text>
      <Text color={props.color}>{tail}</Text>
    </Text>
  )
}

export default Shimmer
