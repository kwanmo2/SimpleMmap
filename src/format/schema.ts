// 자식 요소 순서 — MindManager 9.2 번들 XSD(xsd/MindManagerApplication.xsd)의 xs:sequence 기준.
// MindManager는 sequence 순서를 지키지 않은 파일을 거부할 수 있으므로 새 요소는 반드시 이 순서대로 삽입한다.
import type { Element } from '@xmldom/xmldom'

export const TOPIC_CHILD_ORDER = [
  'cor:Custom', // cor:Object 상속
  'ap:SubTopics',
  'ap:FloatingTopics',
  'ap:OneBoundary',
  'ap:OneImage',
  'ap:TopicViewGroup',
  'ap:Text',
  'ap:Color',
  'ap:NotesGroup',
  'ap:Offset',
  'ap:IconsGroup',
  'ap:SubTopicShape',
  'ap:LabelFloatingTopicShape',
  'ap:CalloutFloatingTopicShape',
  'ap:TopicLayout',
  'ap:SubTopicsShape',
  'ap:SubTopicsVisibility',
  'ap:Hyperlink',
  'ap:Task',
  'ap:Bookmark',
  'ap:Comments',
  'ap:SpellingOptions',
  'ap:InkGroup',
  'ap:OneInkSketch',
  'ap:AttachmentGroup',
  'ap:TextLabels',
  'ap:BusinessDataGroup',
  'ap:CustomControlStripData',
  'ap:TopicReview',
  'ap:TopicBookmark',
  'ap:ModificationStamp',
  'ap:CreationInfo',
  'ap:LoadingState',
  'ap:NamedDefaultsId',
] as const

/** order 테이블 기준으로 child를 parent의 올바른 위치에 삽입한다. 테이블에 없는 기존 요소는 위치 판단에서 무시한다. */
export function insertInOrder(parent: Element, child: Element, order: readonly string[]): void {
  const idx = order.indexOf(child.nodeName)
  if (idx < 0) throw new Error(`순서 테이블에 없는 요소: ${child.nodeName}`)
  for (let c = parent.firstChild; c; c = c.nextSibling) {
    if (c.nodeType !== 1) continue
    if (order.indexOf(c.nodeName) > idx) {
      parent.insertBefore(child, c)
      return
    }
  }
  parent.appendChild(child)
}

/** 스톡 아이콘 IconType 값 — MindManager 9.2 번들 XSD(xsd/MindManagerPrimitive.xsd)의 IconType 열거형 */
export const STOCK_ICONS = [
  'urn:mindjet:SmileyHappy', 'urn:mindjet:SmileyNeutral', 'urn:mindjet:SmileySad', 'urn:mindjet:SmileyAngry', 'urn:mindjet:SmileyScreaming', 'urn:mindjet:Clock',
  'urn:mindjet:Calendar', 'urn:mindjet:Letter', 'urn:mindjet:Email', 'urn:mindjet:Mailbox', 'urn:mindjet:Megaphone', 'urn:mindjet:House',
  'urn:mindjet:Rolodex', 'urn:mindjet:Dollar', 'urn:mindjet:Euro', 'urn:mindjet:FlagRed', 'urn:mindjet:FlagBlue', 'urn:mindjet:FlagGreen',
  'urn:mindjet:FlagBlack', 'urn:mindjet:FlagOrange', 'urn:mindjet:FlagYellow', 'urn:mindjet:FlagPurple', 'urn:mindjet:TrafficLightsRed', 'urn:mindjet:Marker1',
  'urn:mindjet:Marker2', 'urn:mindjet:Marker3', 'urn:mindjet:Marker4', 'urn:mindjet:Marker5', 'urn:mindjet:Marker6', 'urn:mindjet:Marker7',
  'urn:mindjet:Resource1', 'urn:mindjet:Resource2', 'urn:mindjet:PadlockLocked', 'urn:mindjet:PadlockUnlocked', 'urn:mindjet:ArrowUp', 'urn:mindjet:ArrowRight',
  'urn:mindjet:TwoEndArrow', 'urn:mindjet:Phone', 'urn:mindjet:Cellphone', 'urn:mindjet:Camera', 'urn:mindjet:Fax', 'urn:mindjet:Stop',
  'urn:mindjet:ExclamationMark', 'urn:mindjet:QuestionMark', 'urn:mindjet:ThumbsUp', 'urn:mindjet:OnHold', 'urn:mindjet:Hourglass', 'urn:mindjet:Emergency',
  'urn:mindjet:NoEntry', 'urn:mindjet:Bomb', 'urn:mindjet:Key', 'urn:mindjet:Glasses', 'urn:mindjet:JudgeHammer', 'urn:mindjet:Rocket',
  'urn:mindjet:Scales', 'urn:mindjet:Redo', 'urn:mindjet:Lightbulb', 'urn:mindjet:CoffeeCup', 'urn:mindjet:TwoFeet', 'urn:mindjet:Meeting',
  'urn:mindjet:Check', 'urn:mindjet:Note', 'urn:mindjet:ThumbsDown', 'urn:mindjet:ArrowLeft', 'urn:mindjet:ArrowDown', 'urn:mindjet:Book',
  'urn:mindjet:MagnifyingGlass', 'urn:mindjet:BrokenConnection', 'urn:mindjet:Information', 'urn:mindjet:Folder',
] as const
