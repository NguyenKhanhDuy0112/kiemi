import { $, api } from './common';

interface ChatState {
  messages: string[];
  realtime: boolean;
}

function paint(s: ChatState): void {
  const list = $('#messages');
  list.replaceChildren(
    ...s.messages.map((m) => {
      const li = document.createElement('li');
      li.textContent = m;
      return li;
    }),
  );
  $('#live-state').textContent = s.realtime ? 'Cập nhật tức thì: bật' : 'Cập nhật tức thì: tắt';
}

const first = await api<ChatState>('/api/chat');
paint(first.data);
// Without realtime the page only shows what it loaded with.
if (first.data.realtime) {
  setInterval(() => {
    void api<ChatState>('/api/chat').then((r) => {
      if (r.data.realtime) paint(r.data);
    });
  }, 400);
}

$('#send').addEventListener('click', () => {
  const input = $<HTMLInputElement>('#msg');
  void api<ChatState>('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ text: input.value }),
  }).then((r) => {
    input.value = '';
    paint(r.data);
  });
});
