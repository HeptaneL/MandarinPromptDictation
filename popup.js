// popup.js
const statusEl = document.getElementById('status');
const toggleButton = document.getElementById('toggle-recording');
const clearButton = document.getElementById('clear-text');
const chineseOutput = document.getElementById('chinese-output');
const englishOutput = document.getElementById('english-output');
const copyButtons = document.querySelectorAll('.copy-button');
const retranslateButton = document.getElementById('retranslate');

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
let isRecording = false;
let finalTranscript = '';
let translationRequestId = 0;
let userEdited = false;
let editTimeout = null;

function setStatus(text, mode = 'idle') {
  statusEl.textContent = text;
  statusEl.classList.toggle('recording', mode === 'recording');
  statusEl.classList.toggle('idle', mode !== 'recording');
}

function resetState() {
  finalTranscript = '';
  chineseOutput.value = '';
  englishOutput.value = '';
  englishOutput.placeholder = '等待翻译...';
  userEdited = false;
}

function toggleButtons(recording) {
  if (recording) {
    toggleButton.textContent = '停止录音';
    toggleButton.classList.add('recording');
    setStatus('正在录音...请开始说话', 'recording');
  } else {
    toggleButton.textContent = '开始录音';
    toggleButton.classList.remove('recording');
    setStatus('录音已停止', 'idle');
  }
}

// --- 翻译函数 ---
async function translateToEnglish(text, requestId) {
  if (!text.trim()) {
    if (translationRequestId === requestId) {
      englishOutput.value = '';
    }
    return;
  }

  englishOutput.value = '翻译中...';
  try {
    const params = new URLSearchParams({
      client: 'gtx',
      sl: 'zh-CN',
      tl: 'en',
      dt: 't',
      q: text
    });
    const response = await fetch(`https://translate.googleapis.com/translate_a/single?${params.toString()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const translated = Array.isArray(data?.[0])
      ? data[0].map((part) => part[0]).join('').trim()
      : '';
    if (translationRequestId === requestId) {
      englishOutput.value = translated || '翻译结果为空';
    }
  } catch (error) {
    if (translationRequestId === requestId) {
      englishOutput.value = `翻译失败：${error.message}`;
    }
  }
}

// --- 语音识别回调 ---
function handleResult(event) {
  let interimTranscript = '';

  // 如果用户已经编辑，采用追加模式
  if (userEdited) {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        const cleaned = result[0].transcript.trim();
        if (cleaned) {
          chineseOutput.value += ' ' + cleaned;
          const currentRequestId = ++translationRequestId;
          translateToEnglish(chineseOutput.value, currentRequestId);
        }
      }
    }
    return;
  }

  for (let i = event.resultIndex; i < event.results.length; i++) {
    const result = event.results[i];
    const transcript = result[0].transcript;
    if (result.isFinal) {
      const cleaned = transcript.trim();
      if (cleaned) {
        finalTranscript = finalTranscript ? `${finalTranscript} ${cleaned}` : cleaned;
        const currentRequestId = ++translationRequestId;
        translateToEnglish(finalTranscript, currentRequestId);
      }
    } else {
      interimTranscript += transcript;
    }
  }

  const combined = [finalTranscript, interimTranscript.trim()].filter(Boolean).join(' ');
  chineseOutput.value = combined;
}

// --- 初始化识别 ---
function initRecognition() {
  recognition = new SpeechRecognition();
  recognition.lang = 'zh-CN';
  recognition.interimResults = true;
  recognition.continuous = true;

  recognition.onstart = () => {
    isRecording = true;
    toggleButtons(true);
  };

  recognition.onerror = (event) => {
    setStatus(`语音识别出错：${event.error}`, 'idle');
    toggleButtons(false);
    isRecording = false;
  };

  recognition.onend = () => {
    if (isRecording) {
      recognition.start(); // 自动重启保持连续识别
    } else {
      toggleButtons(false);
    }
  };

  recognition.onresult = handleResult;
}

function startRecording() {
  if (!recognition) initRecognition();
  try {
    recognition.start();
    setStatus('请求麦克风权限...', 'recording');
  } catch (error) {
    setStatus(`无法开始录音：${error.message}`, 'idle');
  }
}

function stopRecording() {
  if (recognition && isRecording) {
    isRecording = false;
    recognition.stop();
  }
}

// --- 编辑检测：混合模式 ---
chineseOutput.addEventListener('input', () => {
  userEdited = true;
  clearTimeout(editTimeout);
  editTimeout = setTimeout(() => {
    // 用户连续编辑10秒以上未讲话则自动暂停
    if (isRecording) {
      stopRecording();
      setStatus('检测到手动编辑，录音已暂停', 'idle');
    }
  }, 10000);
});

// --- 按钮事件 ---
toggleButton.addEventListener('click', () => {
  if (!SpeechRecognition) {
    setStatus('当前浏览器不支持语音识别', 'idle');
    return;
  }
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

clearButton.addEventListener('click', () => {
  stopRecording();
  resetState();
  toggleButtons(false);
  setStatus('内容已清除，点击开始录音', 'idle');
});

// --- 复制按钮 ---
copyButtons.forEach((button) => {
  button.addEventListener('click', async () => {
    const targetId = button.getAttribute('data-target');
    const element = document.getElementById(targetId);
    if (!element) return;
    const text = element.value;
    if (!text) {
      setStatus('没有可复制的内容', 'idle');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatus('已复制到剪贴板', 'idle');
    } catch (error) {
      setStatus(`复制失败：${error.message}`, 'idle');
    }
  });
});

// --- 重新翻译按钮 ---
if (retranslateButton) {
  retranslateButton.addEventListener('click', async () => {
    const text = chineseOutput.value.trim();
    if (!text) {
      setStatus('没有可翻译的内容', 'idle');
      englishOutput.value = '';
      return;
    }
    const currentRequestId = ++translationRequestId;
    setStatus('正在重新翻译...', 'recording');
    englishOutput.value = '翻译中...';
    try {
      await translateToEnglish(text, currentRequestId);
      setStatus('翻译已更新', 'idle');
    } catch (error) {
      englishOutput.value = `翻译失败：${error.message}`;
      setStatus('翻译失败', 'idle');
    }
  });
}

if (!SpeechRecognition) {
  toggleButton.disabled = true;
  setStatus('当前浏览器不支持语音识别', 'idle');
} else {
  setStatus('点击开始录音', 'idle');
}
