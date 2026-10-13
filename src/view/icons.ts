// MindManager 스톡 아이콘 → 화면 표시용 기호. 원본 아이콘 이미지가 없으므로 근사치로 표시한다.
const FLAG_COLORS: Record<string, string> = {
  FlagRed: '#e5484d',
  FlagBlue: '#3e63dd',
  FlagGreen: '#30a46c',
  FlagBlack: 'var(--flag-black)', // 다크 테마에서 배경에 묻히지 않도록 App.css에서 테마별로 정의
  FlagOrange: '#f76b15',
  FlagYellow: '#ffc53d',
  FlagPurple: '#8e4ec6',
}

const EMOJI: Record<string, string> = {
  SmileyHappy: '😀',
  SmileyNeutral: '😐',
  SmileySad: '🙁',
  SmileyAngry: '😠',
  SmileyScreaming: '😱',
  Clock: '🕒',
  Calendar: '📅',
  Letter: '✉️',
  Email: '📧',
  Mailbox: '📫',
  Megaphone: '📣',
  House: '🏠',
  Rolodex: '📇',
  Dollar: '💲',
  Euro: '💶',
  TrafficLightsRed: '🚦',
  Marker1: '❶',
  Marker2: '❷',
  Marker3: '❸',
  Marker4: '❹',
  Marker5: '❺',
  Marker6: '❻',
  Marker7: '❼',
  Resource1: '👤',
  Resource2: '👥',
  PadlockLocked: '🔒',
  PadlockUnlocked: '🔓',
  ArrowUp: '⬆️',
  ArrowRight: '➡️',
  ArrowLeft: '⬅️',
  ArrowDown: '⬇️',
  TwoEndArrow: '↔️',
  Phone: '☎️',
  Cellphone: '📱',
  Camera: '📷',
  Fax: '📠',
  Stop: '🛑',
  ExclamationMark: '❗',
  QuestionMark: '❓',
  ThumbsUp: '👍',
  ThumbsDown: '👎',
  OnHold: '⏸️',
  Hourglass: '⏳',
  Emergency: '🚨',
  NoEntry: '⛔',
  Bomb: '💣',
  Key: '🔑',
  Glasses: '👓',
  JudgeHammer: '🔨',
  Rocket: '🚀',
  Scales: '⚖️',
  Redo: '🔁',
  Lightbulb: '💡',
  CoffeeCup: '☕',
  TwoFeet: '👣',
  Meeting: '🤝',
  Check: '✅',
  Note: '📝',
  Book: '📖',
  MagnifyingGlass: '🔍',
  BrokenConnection: '🔌',
  Information: 'ℹ️',
  Folder: '📁',
}

export interface IconVisual {
  name: string
  emoji: string | null
  flagColor: string | null
}

export function iconVisual(iconType: string): IconVisual {
  const name = iconType.replace('urn:mindjet:', '')
  return { name, emoji: EMOJI[name] ?? (FLAG_COLORS[name] ? null : '◆'), flagColor: FLAG_COLORS[name] ?? null }
}
