import {normalizeAnswer, dayKey, previousDay, summarize} from './core.mjs';

const root=document.querySelector('#app'), tg=window.Telegram?.WebApp;
const storageKey='foxford-miniapp-v1';
let toastTimer;
const state={route:'home',data:null,session:null,result:null,range:30,busy:false,drafts:{},api:false,bank:[],query:''};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={
  home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  book:'<path d="M12 6C9 3 5 3 2 4v15c4-1 7 0 10 2 3-2 6-3 10-2V4c-3-1-7-1-10 2Zm0 0v15"/>',
  error:'<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/>',
  chart:'<path d="M4 3v17h17M8 15l4-5 4 2 5-7"/>',
  arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',
  back:'<path d="M20 12H5m6-6-6 6 6 6"/>',
  chevron:'<path d="m9 6 6 6-6 6"/>',
  flame:'<path d="M13 3c2 6 7 6 7 12a8 8 0 0 1-16 0c0-4 3-7 5-9-1 4 1 5 2 5 0-4 2-5 2-8Z"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  check:'<path d="m5 12 4 4L20 5"/>',
  shuffle:'<path d="M3 6h3c5 0 7 12 12 12h3m-5-4 5 4-5 4M3 18h3c2 0 3-3 5-6m3-4c1-1 2-2 4-2h3m-5-4 5 4-5 4"/>',
  sparkle:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5ZM21 2v4m-2-2h4"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.5"/>',
  export:'<path d="M12 3v12m-4-8 4-4 4 4M4 14v6h16v-6"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>'
};
const icon=(name,size=18)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.book}</svg>`;
const plural=(n,forms)=>`${n} ${forms[n%100>=11&&n%100<=14?2:n%10===1?0:n%10>=2&&n%10<=4?1:2]}`;
const taskCount=n=>plural(n,['задание','задания','заданий']);
const summary=()=>summarize(state.data.attempts,state.data.tasks);
const uniqueTopics=()=>[...new Set(state.data.tasks.map(t=>t.topic))];
const symbols={'Проценты':'%','Уравнения':'x','Планиметрия':'△','Практические задачи':'₽','Стереометрия':'◈','Формулы':'ƒ','Комбинаторика':'n!','Функции':'y','Логика':'∴','Вероятность':'P'};
const topicOrder=['Проценты','Уравнения','Планиметрия','Вероятность','Формулы','Практические задачи','Стереометрия','Комбинаторика','Функции','Логика'];
const sortedTopics=()=>uniqueTopics().sort((a,b)=>topicOrder.indexOf(a)-topicOrder.indexOf(b));

function toast(message){const node=document.querySelector('#toast');node.textContent=message;node.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove('visible'),4200)}
function localRead(){try{const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');return {attempts:Array.isArray(saved.attempts)?saved.attempts:[],active:saved.active||null}}catch{return {attempts:[],active:null}}}
function localSave(){try{localStorage.setItem(storageKey,JSON.stringify({attempts:state.data.attempts,active:state.data.active}))}catch{toast('Не удалось сохранить прогресс в браузере. Не закрывай страницу до конца тренировки.')}}
async function api(path,body){
  const headers={'Content-Type':'application/json'};if(tg?.initData)headers.Authorization='tma '+tg.initData;
  const response=await fetch('/api/'+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,credentials:'same-origin'});
  if(!response.headers.get('content-type')?.includes('application/json')){const error=new Error('Сервер недоступен');error.noApi=true;throw error}
  const result=await response.json();if(!response.ok){const error=new Error(result.error||'Не удалось выполнить запрос');error.noApi=response.status===404||response.status===405;throw error}return result;
}

async function boot(){
  try{
    if(tg){tg.ready();tg.expand();try{tg.setHeaderColor('#ffffff');tg.setBackgroundColor('#ffffff');if(tg.isVersionAtLeast?.('7.0'))tg.setBottomBarColor?.('#ffffff')}catch{}}
    try{state.data=await api('bootstrap');state.api=true}
    catch(error){
      if(!error.noApi)throw error;
      if(tg?.initData)throw new Error('Для запуска в Telegram нужно подключить сервер тренажёра. В браузере доступен предпросмотр.');
      const response=await fetch('./practice-bank.json');if(!response.ok)throw new Error('Не удалось загрузить банк заданий');
      state.bank=await response.json();const stored=localRead();
      state.data={user:{first_name:''},tasks:state.bank.map(({answer,...task})=>task),...stored,mode:'browser'};
      if(state.data.active&&!state.data.tasks.some(t=>t.key===state.data.active.task?.key))state.data.active=null;
    }
    render();
  }catch(error){root.innerHTML=`<div class="boot"><span class="boot-mark">ƒ</span><h2>Не удалось открыть тренажёр</h2><p style="max-width:360px;text-align:center;padding:0 20px;line-height:1.8">${esc(error.message)}</p><button class="button purple" data-action="reload">Попробовать ещё раз</button></div>`}
}

function navItems(s){return [['home','home','Главная'],['topics','book','Темы'],['mistakes','error','Мои ошибки'],['stats','chart','Статистика']].map(([route,ico,label])=>`<button data-nav="${route}" class="${state.route===route||state.route==='workout'&&route==='topics'?'active':''}" ${state.route===route?'aria-current="page"':''}>${icon(ico)}<span>${label}</span>${route==='mistakes'&&s.mistakes.length?`<span class="nav-count">${s.mistakes.length}</span>`:''}</button>`).join('')}
function brand(){return `<div class="brand"><img src="./foxford-logo.svg" alt="Фоксфорд" width="137" height="40"></div>`}
function shell(content){
  const s=summary(), names={home:'Главная',topics:'Темы',mistakes:'Мои ошибки',stats:'Статистика',workout:'Тренировка'};
  const first=state.data.user.first_name||'',initial=first?first[0].toUpperCase():'Я';
  return `<div class="layout"><aside class="sidebar"><div>${brand()}<div class="brand-note">тренажёр по математике</div></div><nav class="nav" aria-label="Основная навигация">${navItems(s)}</nav><div class="sidebar-bottom"><div class="sidebar-tip">${icon('sparkle',22)}<strong>Маленькие шаги.<br>Большой результат.</strong><p>Даже одно задание в день —<br>это уже движение вперёд.</p></div><div class="sidebar-footer"><span>ЕГЭ · базовый уровень</span><button data-action="info" aria-label="О тренажёре">${icon('info',15)}</button></div></div></aside><main class="main"><header class="topbar"><div class="breadcrumb">Тренажёр ${icon('chevron',11)} <b>${names[state.route]}</b></div><div class="mobile-brand">${brand()}</div><div class="top-actions">${state.data.mode!=='telegram'?'<span class="mode-label">Предпросмотр</span>':''}<span class="level-pill"><span class="level-dot"></span>Математика · база</span><button class="avatar" data-action="info" aria-label="Профиль и настройки">${esc(initial)}</button></div></header><div id="view">${content}</div><footer class="main-footer"><span>${icon('sparkle',12)} Учиться получается. Вместе с Фоксфордом.</span><span>Каждое задание — шаг вперёд</span></footer></main><nav class="mobile-nav" aria-label="Навигация">${navItems(s)}</nav></div>`;
}

function heading(title,description,extra=''){return `<div class="page-heading"><div><h1>${title}</h1>${description?`<p>${description}</p>`:''}</div>${extra}</div>`}
function metrics(s){return `<div class="metrics">${[
  ['book','','Всего попыток',s.total,'за всё время'],
  ['target','green','Точность',s.total?s.accuracy+'%':'—','правильных ответов'],
  ['flame','orange','Серия дней',s.streak,'занимайся каждый день'],
  ['error','rose','Нужно повторить',s.mistakes.length,'заданий в работе над ошибками']
].map(([ico,color,title,value,note])=>`<article class="metric"><div class="metric-top"><span class="metric-icon ${color}">${icon(ico,14)}</span>${title}</div><div class="metric-value">${value}</div><p class="metric-note">${note}</p></article>`).join('')}</div>`}

function heroArt(){return `<div class="hero-art" aria-hidden="true"><img src="./student.webp" alt="" width="1240" height="1292" fetchpriority="high"></div>`}

function topicCard(topic,full=false){const s=summary(),tasks=state.data.tasks.filter(t=>t.topic===topic),done=tasks.filter(t=>s.solvedKeys.has(t.key)).length;return `<button class="topic-card" data-topic="${esc(topic)}"><span class="topic-symbol">${symbols[topic]||'x'}</span><span class="topic-info"><strong>${esc(topic)}</strong><p>${taskCount(tasks.length)}</p></span>${icon('chevron',13)}${full?`<span class="topic-progress"><span class="progress-track"><span style="width:${done/tasks.length*100}%"></span></span><span>${done} / ${tasks.length}</span></span>`:''}</button>`}
function home(){const s=summary(),first=state.data.user.first_name,hello=first?`Привет, ${esc(first)}!`:'Привет!';const date=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',weekday:'long',timeZone:'Europe/Moscow'}).format(new Date());return `${heading(hello+' Давай порешаем?','Твой тренажёр по базовой математике ЕГЭ',`<span class="date-label">${esc(date)}</span>`)}<section class="hero"><div class="hero-content"><div class="hero-badge">ЕГЭ–2027 · МАТЕМАТИКА · БАЗА</div><h2>Математика<br><em>на твоей стороне.</em></h2><p>Решай в своём темпе, возвращайся к сложному<br>и становись увереннее с каждым заданием.</p><div class="hero-buttons"><button class="button primary" ${state.data.active?'data-action="resume"':'data-start="random"'}>${state.data.active?'Продолжить тренировку':'Начать тренировку'} ${icon('arrow',16)}</button><button class="button ghost" data-nav="topics">Выбрать тему ${icon('chevron',13)}</button></div></div>${heroArt()}</section><div class="section-heading"><h2>Твой прогресс</h2><button data-nav="stats">Вся статистика ${icon('arrow',13)}</button></div>${metrics(s)}<div class="home-grid"><section><div class="section-heading"><h2>Что потренируем?</h2><button data-nav="topics">Все темы ${icon('arrow',13)}</button></div><div class="topic-grid">${sortedTopics().slice(0,4).map(t=>topicCard(t)).join('')}</div><p class="small-note">${icon('info',13)}${state.data.tasks.length} заданий из твоего банка · условия и рисунки внутри тренажёра</p></section><section><div class="section-heading"><h2>Немного каждый день</h2></div><div class="daily-card"><div class="daily-card-top"><h3>Маленький шаг.<br>Большой результат.</h3><span>${icon('flame',18)}</span></div><p>${s.todayTotal>=5?'Отличный темп! Сегодня ты уже решил не меньше пяти заданий.':'Пять небольших заданий — и математика станет чуть понятнее.'}</p><div class="goal-line"><span>Сегодня</span><strong>${Math.min(s.todayTotal,5)} из 5 заданий</strong></div><div class="progress-track"><span style="width:${Math.min(s.todayTotal/5*100,100)}%"></span></div><button class="button" data-start="random">${s.todayTotal?'Продолжить практику':'Сделать первый шаг'} ${icon('arrow',13)}</button></div></section></div>`}

function topicGrid(query=''){return sortedTopics().filter(t=>t.toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))).map(t=>topicCard(t,true)).join('')||'<p class="archive-note">Такая тема не найдена. Попробуй изменить запрос.</p>'}
function topics(){return `${heading('Выбери свою тему','Начни с того, что хочется понять лучше. Можно решить одно задание или целую подборку.')}<div class="topics-toolbar"><label class="visually-hidden" for="topic-search">Найти тему</label><input class="search-field" id="topic-search" type="search" placeholder="Найти тему…" value="${esc(state.query)}" autocomplete="off"><button class="button light" data-start="random" aria-label="Случайное задание">${icon('shuffle',17)}<span>Случайное</span></button></div><div class="topic-grid all-topics" id="topic-grid">${topicGrid(state.query)}</div>`}
function empty(iconName,title,message,button='Начать тренировку'){return `<div class="empty"><div class="empty-icon">${icon(iconName,28)}</div><h2>${title}</h2><p>${message}</p><button class="button purple" data-start="random">${button} ${icon('arrow',16)}</button></div>`}
function mistakes(){const s=summary();return `${heading('Ошибки — часть пути',s.mistakes.length?`${taskCount(s.mistakes.length)} можно повторить. Правильный ответ уберёт задание из этого списка.`:'Здесь будут задания, к которым стоит вернуться.',s.mistakes.length?'<button class="button purple" data-start="mistakes">Повторить всё '+icon('arrow',15)+'</button>':'')}${s.mistakes.length?`<div class="mistake-list">${s.mistakes.map(({task})=>`<article class="mistake-card"><div class="mistake-card-head"><span class="tag">${esc(task.topic)}</span><span class="task-source">ФИПИ · ${esc(task.key)}</span></div><p>${esc(task.question)}</p><button class="button light" data-retry="${esc(task.key)}">Попробовать ещё раз ${icon('arrow',13)}</button></article>`).join('')}</div>`:empty('check',s.total?'Сейчас ошибок нет':'Пока ни одной ошибки',s.total?'Все задания из списка уже решены правильно. Можно перейти к новой теме.':'Решай задания без страха ошибиться. Всё, что не получится с первого раза, можно будет повторить.')}${s.archivedMistakes?`<p class="archive-note">В старой истории есть ещё ${taskCount(s.archivedMistakes)}, которых нет в подключённом банке. Они сохранены в общей статистике.</p>`:''}`}

function shortDate(value){const key=dayKey(value);return key?key.slice(8)+'.'+key.slice(5,7):'—'}
function lineChart(s){
  const count=state.range,dates=Array.from({length:count},(_,i)=>previousDay(s.today,count-i-1)),points=dates.map((key,i)=>s.days.has(key)?{x:37+i/(count-1)*500,y:180-s.days.get(key).correct/s.days.get(key).total*145,key,value:Math.round(s.days.get(key).correct/s.days.get(key).total*100)}:null).filter(Boolean);
  if(!points.length)return `<div class="chart-empty">${icon('chart',35)}За эти ${count} дней ещё нет попыток.<br>Реши задание — и здесь появится твой прогресс.</div>`;
  const poly=points.map(p=>p.x+','+p.y).join(' ');
  return `<svg viewBox="0 0 560 218" role="img" aria-label="Точность ответов по дням за ${count} дней"><defs><linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#c5aff9" stop-opacity=".35"/><stop offset="1" stop-color="#c5aff9" stop-opacity="0"/></linearGradient></defs>${[0,50,100].map(v=>`<line x1="37" x2="537" y1="${180-v/100*145}" y2="${180-v/100*145}" stroke="#f0ebf6" stroke-dasharray="4 5"/><text x="0" y="${184-v/100*145}" fill="#b5a7c5" font-size="9">${v}%</text>`).join('')}${points.length>1?`<polygon points="${points[0].x},180 ${poly} ${points.at(-1).x},180" fill="url(#chart-fill)"/><polyline points="${poly}" stroke="#9a79dc" stroke-width="2.5" fill="none" stroke-linejoin="round"/>`:''}${points.map(p=>`<circle cx="${p.x}" cy="${p.y}" r="3.7" fill="#9a79dc" stroke="white" stroke-width="2"><title>${shortDate(p.key+'T12:00:00+03:00')}: ${p.value}%</title></circle>`).join('')}${[0,Math.floor((count-1)/2),count-1].map(i=>`<text x="${37+i/(count-1)*500}" y="208" fill="#b5a7c5" font-size="9" text-anchor="${i===0?'start':i===count-1?'end':'middle'}">${shortDate(dates[i]+'T12:00:00+03:00')}</text>`).join('')}</svg>`;
}

function radar(s){const ts=sortedTopics(),n=ts.length,cx=190,cy=150,r=91,point=(i,k)=>[cx+Math.cos(i/n*Math.PI*2-Math.PI/2)*r*k,cy+Math.sin(i/n*Math.PI*2-Math.PI/2)*r*k];const polygon=k=>ts.map((_,i)=>point(i,k).join(',')).join(' ');return `<svg viewBox="0 0 380 305" role="img" aria-label="Точность ответов по темам">${[.25,.5,.75,1].map(k=>`<polygon points="${polygon(k)}" fill="${k===1?'#faf7ff':'none'}" stroke="#e8dff3" stroke-width=".8"/>`).reverse().join('')}${ts.map((t,i)=>{const p=point(i,1);return `<line x1="${cx}" y1="${cy}" x2="${p[0]}" y2="${p[1]}" stroke="#e8dff3"/>`}).join('')}<polygon points="${ts.map((t,i)=>{const v=s.topics.get(t);return point(i,v?v.correct/v.total:0).join(',')}).join(' ')}" fill="#b797ef50" stroke="#a27bdc" stroke-width="2"/>${ts.map((t,i)=>{const p=point(i,1.32),name=t==='Практические задачи'?'Практика':t==='Комбинаторика'?'Комбинат.':t;return `<text x="${p[0]}" y="${p[1]+3}" fill="#a18cb3" font-size="8" text-anchor="middle">${esc(name)}</text>`}).join('')}</svg>`}

function stats(){const s=summary();return `${heading('Твой прогресс в цифрах','Каждая попытка помогает понять, что уже получается, а чему стоит уделить внимание.')} ${metrics(s)}<div class="stats-grid"><section class="panel"><div class="panel-title"><h2>Точность по дням</h2><div class="segmented" aria-label="Период графика">${[7,30].map(n=>`<button data-range="${n}" class="${state.range===n?'selected':''}" aria-pressed="${state.range===n}">${n} дней</button>`).join('')}</div></div><div class="chart">${lineChart(s)}</div><p class="chart-note">Дни без попыток не снижают точность. Общие показатели выше — за всё время.</p></section><section class="panel"><div class="panel-title"><h2>Роза тем</h2><span class="muted" style="font-size:9px">точность, %</span></div><div class="chart">${s.total?radar(s):'<div class="chart-empty">'+icon('target',35)+'Решай задания из разных тем,<br>чтобы увидеть свои сильные стороны.</div>'}</div></section></div><section class="panel streak-panel"><div><strong>${s.current}</strong><p>верных ответов подряд</p></div><div class="divider"></div><div><strong>${s.best}</strong><p>лучшая серия ответов</p></div><div class="divider"></div><div><strong>${s.weekTotal}</strong><p>попыток за 7 дней</p></div><div class="divider"></div><div><strong>${s.weekTotal?s.weekAccuracy+'%':'—'}</strong><p>точность за 7 дней</p></div></section><div class="stats-grid"><section class="panel"><div class="panel-title"><h2>Разберём по темам</h2></div><div class="topic-bars">${sortedTopics().map(topic=>{const t=s.topics.get(topic),acc=t?Math.round(t.correct/t.total*100):0;return `<div><div class="topic-bar-label"><b>${esc(topic)}</b><span>${t?acc+'% · '+plural(t.total,['попытка','попытки','попыток']):'ещё не решал'}</span></div><div class="progress-track"><span style="width:${acc}%"></span></div></div>`}).join('')}</div></section><section class="panel"><div class="panel-title"><h2>Последние попытки</h2></div>${state.data.attempts.length?[...state.data.attempts].reverse().slice(0,8).map(row=>`<div class="history-row"><span class="history-check ${row.is_correct?'':'wrong'}">${icon(row.is_correct?'check':'error',13)}</span><div class="history-info"><strong>${esc(row.topic)}</strong><small>Твой ответ: ${esc(row.user_answer)}</small></div><time class="history-time">${shortDate(row.created_at)}</time></div>`).join(''):'<p class="chart-empty">Твоя первая попытка<br>скоро появится здесь.</p>'}</section></div>`}

function workout(){
  const session=state.session;if(!session)return home();const t=session.task,type=t.answer_type;
  const mode=session.mode==='mistakes'?'Работа над ошибками':session.mode==='topic'?'Практика по теме':'Случайное задание';
  const hint=type==='matching'?'Введи цифры в порядке, указанном в условии.':type==='multiple_choice'?'Введи номера выбранных утверждений по порядку, без пробелов.':'Можно использовать точку или запятую. Единицы измерения вводить не нужно.';
  return `<div class="workout"><div class="workout-top"><button class="back-button" data-nav="home">${icon('back',16)}К тренажёру</button><span class="workout-label">${mode}</span></div><article class="question-card"><div class="question-top"><span class="tag">${esc(t.topic)}</span><span class="task-source">ФИПИ · ${esc(t.key)}</span></div><h1>Попробуем разобраться</h1><div class="question-text">${esc(t.question)}</div>${(t.images||[]).map(src=>`<button class="question-image" data-image="./${esc(src.replace(/^\/+/,''))}" aria-label="Увеличить рисунок к заданию"><img src="./${esc(src.replace(/^\/+/,''))}" alt="Рисунок к заданию по теме ${esc(t.topic)}"><small>Нажми, чтобы увеличить</small></button>`).join('')}${state.result?`<div class="result ${state.result.is_correct?'':'wrong'}" role="status">${icon(state.result.is_correct?'check':'error',22)}<div><strong>${state.result.is_correct?'Всё верно. Отличная работа!':'Пока не получилось — и это нормально.'}</strong><p>${state.result.is_correct?'Результат сохранён. Двигаемся дальше?':'Задание сохранено в «Моих ошибках». Вернись к нему позже и попробуй ещё раз.'}</p></div></div>`:`<form class="answer-area" id="answer-form"><label for="answer">Твой ответ</label><div class="answer-controls"><input class="answer-input" id="answer" name="answer" inputmode="${type==='matching'||type==='multiple_choice'?'numeric':'text'}" maxlength="128" autocomplete="off" placeholder="Введи ответ…" value="${esc(state.drafts[session.token]||'')}" aria-describedby="answer-hint" required><button type="submit" class="button purple" ${state.busy?'disabled':''}>${state.busy?'Проверяем…':'Проверить ответ'} ${icon('arrow',16)}</button></div><p class="answer-hint" id="answer-hint">${hint}</p><p class="input-error" id="input-error" role="alert"></p></form>`}</article><div class="task-bottom"><button class="skip-button" data-action="skip">${icon('shuffle',15)}Другое задание</button>${state.result?'<button class="button purple" data-action="next">Дальше '+icon('arrow',15)+'</button>':''}</div><p class="session-note">${state.result?'В статистике учитывается каждая отправленная попытка.':'Можно вернуться позже: незаконченная тренировка сохранится.'}</p></div>`;
}

function render(){if(!state.data)return;root.innerHTML=shell(({home,topics,mistakes,stats,workout}[state.route]||home)());try{if(state.route==='workout')tg?.BackButton?.show();else tg?.BackButton?.hide()}catch{}}
function navigate(route){state.route=route;state.query='';render();window.scrollTo({top:0,behavior:'instant'})}

async function start(mode='random',extra={}){
  if(state.busy)return;state.busy=true;
  try{
    let session;
    if(state.api)session=await api('session',{mode,...extra});
    else{
      let candidates=state.data.tasks.filter(t=>mode!=='topic'||t.topic===extra.topic);
      if(mode==='mistakes'){const keys=new Set(summary().mistakes.map(v=>v.task.key));candidates=candidates.filter(t=>keys.has(t.key))}
      if(extra.key)candidates=candidates.filter(t=>t.key===extra.key);
      if(candidates.length>1&&extra.exclude)candidates=candidates.filter(t=>t.key!==extra.exclude);
      if(!candidates.length)throw new Error('В этой подборке сейчас нет заданий.');
      session={token:crypto.randomUUID(),task:candidates[Math.floor(Math.random()*candidates.length)],mode};
    }
    state.session=session;state.data.active=session;state.result=null;state.busy=false;
    if(!state.api)localSave();navigate('workout');tg?.HapticFeedback?.selectionChanged?.();
  }catch(error){toast(error.message)}finally{state.busy=false}
}

async function submit(form){
  if(state.busy||state.result)return;
  const answer=new FormData(form).get('answer');if(!answer?.trim()){document.querySelector('#input-error').textContent='Сначала введи ответ.';return}
  state.drafts[state.session.token]=answer;state.busy=true;render();
  try{
    let result;
    if(state.api)result=await api('answer',{token:state.session.token,answer});
    else{
      const task=state.bank.find(t=>t.key===state.session.task.key),value=normalizeAnswer(answer,task.answer_type);
      const correct=value===normalizeAnswer(task.answer,task.answer_type);
      result={is_correct:correct,attempt:{id:(state.data.attempts.at(-1)?.id||0)+1,task_id:task.key,topic:task.topic,user_answer:value,is_correct:Number(correct),created_at:new Date().toISOString()}};
    }
    if(!state.data.attempts.some(row=>row.id===result.attempt.id))state.data.attempts.push(result.attempt);
    state.data.active=null;state.result=result;state.busy=false;delete state.drafts[state.session.token];
    if(!state.api)localSave();render();tg?.HapticFeedback?.notificationOccurred?.(result.is_correct?'success':'error');
  }catch(error){state.busy=false;render();const message=document.querySelector('#input-error');if(message)message.textContent=error.message;else toast(error.message)}finally{state.busy=false}
}

function info(){const dialog=document.querySelector('#info-dialog');const mode=state.data.mode==='telegram'?'Прогресс связан с твоим Telegram-профилем и хранится в общей базе тренажёра.':state.api?'Это предпросмотр с отдельным профилем. Его результаты не меняют статистику учеников Telegram-бота.':'Это браузерный предпросмотр. Прогресс сохраняется в этом браузере. Для общей статистики с ботом нужен запуск через сервер Mini App.';dialog.innerHTML=`<div class="dialog-heading"><h2>Твоя математика</h2><button class="dialog-close" data-close="info-dialog" aria-label="Закрыть">×</button></div><p>Тренажёр Фоксфорда по базовой математике ЕГЭ. ${taskCount(state.data.tasks.length)} с автоматической проверкой.</p><p>${mode}</p><button class="button outline" data-action="export">${icon('export',15)}Скачать свою историю</button>`;dialog.showModal()}

function exportProgress(){const blob=new Blob([JSON.stringify({exported_at:new Date().toISOString(),attempts:state.data.attempts},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='foxford-progress-'+dayKey()+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}

document.addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.dataset.nav)return navigate(button.dataset.nav);
  if(button.dataset.start)return start(button.dataset.start);
  if(button.dataset.topic)return start('topic',{topic:button.dataset.topic});
  if(button.dataset.retry)return start('mistakes',{key:button.dataset.retry});
  if(button.dataset.range){state.range=Number(button.dataset.range);return render()}
  if(button.dataset.close)return document.getElementById(button.dataset.close).close();
  if(button.dataset.image){const dialog=document.querySelector('#image-dialog');dialog.querySelector('img').src=button.dataset.image;return dialog.showModal()}
  switch(button.dataset.action){
    case 'reload':return location.reload();
    case 'resume':state.session=state.data.active;state.result=null;return navigate('workout');
    case 'info':return info();
    case 'export':return exportProgress();
    case 'skip':case 'next':{
      if(state.session.mode==='mistakes'&&!summary().mistakes.length)return navigate('mistakes');
      return start(state.session.mode,{topic:state.session.task.topic,exclude:state.session.task.key});
    }
  }
});
document.addEventListener('submit',event=>{if(event.target.id==='answer-form'){event.preventDefault();submit(event.target)}});
document.addEventListener('input',event=>{if(event.target.id==='topic-search'){state.query=event.target.value;document.querySelector('#topic-grid').innerHTML=topicGrid(state.query)}if(event.target.id==='answer'&&state.session)state.drafts[state.session.token]=event.target.value});
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close()}}));
try{tg?.BackButton?.onClick(()=>navigate('home'))}catch{}
boot();
