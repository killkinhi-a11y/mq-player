(() => {
  const mini = document.querySelector('.mq-mini') || [...document.querySelectorAll('button')].find(b => (b.className || '').toString().includes('mq-mini'));
  if (!mini) return 'no-mini';
  mini.click();
  return 'mini-clicked';
})()
