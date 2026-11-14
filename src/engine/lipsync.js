// 口型轨道：按音素表对齐到帧
// lipTrack: [{ frame, phoneme }]

export function phonemeAt(lipTrack, frame) {
  if (!lipTrack || lipTrack.length === 0) return 'sil'
  let cur = 'sil'
  for (const k of lipTrack) {
    if (k.frame <= frame) cur = k.phoneme
    else break
  }
  return cur
}

// 中文文本 → 音素序列（按韵母归类，每字占 framesPerChar 帧）
const FINAL_MAP = [
  [/a|ia|ua/i, 'A'], [/e|ie|ue|er/i, 'E'], [/i|ii|iii/i, 'I'],
  [/o|uo/i, 'O'], [/u|v|iu/i, 'U']
]
// 简化：按拼音首元音归类；无声母匹配时按闭口
export function textToPhonemes(text, startFrame, framesPerChar = 4) {
  const keys = []
  let f = startFrame
  for (const ch of text) {
    const ph = charToPhoneme(ch)
    keys.push({ frame: f, phoneme: ph })
    f += framesPerChar
  }
  keys.push({ frame: f, phoneme: 'sil' })
  return keys
}

// 常见字音素映射（演示级，覆盖路况播报高频字）
const CHAR_PH = {
  早: 'A', 高: 'A', 峰: 'E', 路: 'U', 况: 'A', 播: 'O', 报: 'A', 现: 'E', 在: 'A',
  环: 'A', 城: 'E', 架: 'A', 车: 'E', 行: 'I', 缓: 'A', 慢: 'A', 请: 'I', 提: 'I',
  前: 'A', 规: 'U', 划: 'A', 出: 'U', 注: 'U', 意: 'I', 安: 'A', 全: 'A', 拥: 'O',
  堵: 'U', 绕: 'A', 道: 'A', 通: 'O', 事: 'I', 故: 'U', 施: 'I', 工: 'O', 封: 'E',
  闭: 'I', 桥: 'A', 隧: 'U', 道: 'A', 东: 'O', 南: 'A', 西: 'I', 北: 'E', 方: 'A',
  向: 'A', 主: 'U', 干: 'A', 快: 'A', 速: 'U', 入: 'U', 口: 'U', 已: 'I', 恢: 'U',
  复: 'U', 正: 'E', 常: 'A', 大: 'A', 家: 'A', 好: 'A', 今: 'I', 天: 'A', 气: 'I',
  雨: 'U', 雪: 'E', 雾: 'U', 滑: 'A', 保: 'A', 持: 'I', 距: 'U', 离: 'I', 您: 'I',
  的: 'E', 出: 'U', 行: 'I', 提: 'I', 醒: 'I', 观: 'U', 众: 'O', 朋: 'E', 友: 'O'
}
function charToPhoneme(ch) {
  return CHAR_PH[ch] || 'A'
}
