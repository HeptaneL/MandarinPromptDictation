const statusEl = document.getElementById('status');
const toggleButton = document.getElementById('toggle-recording');
const clearButton = document.getElementById('clear-text');
const chineseOutput = document.getElementById('chinese-output');
const englishOutput = document.getElementById('english-output');
const copyButtons = document.querySelectorAll('.copy-button');

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
let isRecording = false;
let finalTranscript = '';
let translationRequestId = 0;

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
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
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

function handleResult(event) {
  let interimTranscript = '';

  for (let i = event.resultIndex; i < event.results.length; i += 1) {
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
      // Chrome 会间歇性停止，需要自动重启保持持续识别。
      recognition.start();
    } else {
      toggleButtons(false);
    }
  };

  recognition.onresult = handleResult;
}

function startRecording() {
  if (!recognition) {
    initRecognition();
  }
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

copyButtons.forEach((button) => {
  button.addEventListener('click', async () => {
    const targetId = button.getAttribute('data-target');
    const element = document.getElementById(targetId);
    if (!element) {
      return;
    }
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

if (!SpeechRecognition) {
  toggleButton.disabled = true;
  setStatus('当前浏览器不支持语音识别', 'idle');
} else {
  setStatus('点击开始录音', 'idle');
}
