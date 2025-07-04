// 强制更新部署 - 2025-07-05 

export default {
    /**
     * HTTP fetch handler:
     * 从 env.MY_DOMAIN 获取域名并传递给前端
     */
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;
        const apiMatch = path.match(/^\/api\/emails\/([a-zA-Z0-9\-]+)$/);
        if (apiMatch) {
            const mailboxCode = apiMatch[1];
            return this.handleApiRequest(mailboxCode, env);
        }

        // 从环境变量中安全地读取域名
        const domain = env.MY_DOMAIN;
        if (!domain) {
            return new Response('Server configuration error: MY_DOMAIN is not set.', { status: 500 });
        }
        
        return new Response(generateAppHtml(domain), {
            headers: { 'Content-Type': 'text/html;charset=UTF-8' },
        });
    },

    /**
     * API handler:
     * 根据 mailbox_code 查询邮件
     */
    async handleApiRequest(mailboxCode, env) {
        try {
            const stmt = env.DB.prepare('SELECT from_address, subject, received_at, body_html, body_text FROM emails WHERE mailbox_code = ? ORDER BY received_at DESC');
            const { results } = await stmt.bind(mailboxCode).all();
            return new Response(JSON.stringify(results), {
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (e) {
            console.error("API Error:", e);
            return new Response(JSON.stringify({ error: 'Failed to fetch emails' }), { status: 500 });
        }
    },

    /**
     * Email handler:
     * 接收邮件并根据 mailbox_code 存入数据库
     */
    async email(message, env) {
        const mailboxCode = message.to.split('@')[0];
        if (!mailboxCode) { return; }
        try {
			const PostalMime = (await import('postal-mime')).default;
			const parser = new PostalMime();
            const email = await parser.parse(message.raw);
            const stmt = env.DB.prepare(
                'INSERT INTO emails (mailbox_code, message_id, from_address, to_address, subject, body_html, body_text) VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            await stmt.bind(
                mailboxCode, message.headers.get('message-id'), email.from?.address || 'n/a',
                message.to, email.subject || '(No Subject)', email.html || '', email.text || ''
            ).run();
        } catch (e) { console.error('Email handler error:', e); }
    },
};

/**
 * 生成包含完整前端逻辑的 HTML 页面
 * @param {string} domain - 从环境变量中传入的域名
 */
/**
 * 生成包含完整前端逻辑的 HTML 页面 (使用 Tailwind CSS 美化版)
 * @param {string} domain - 从环境变量中传入的域名
 */
/**
 * 生成包含完整前端逻辑的 HTML 页面 (汉化与美化版)
 * @param {string} domain - 从环境变量中传入的域名
 */
function generateAppHtml(domain) {
    return `
		<!DOCTYPE html>
		<html lang="zh-CN">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>临时邮箱</title>
			<script src="https://cdn.tailwindcss.com"></script>
			<script type="module" src="https://cdn.jsdelivr.net/npm/ionicons@latest/dist/ionicons/ionicons.esm.js"></script>
			<script nomodule src="https://cdn.jsdelivr.net/npm/ionicons@latest/dist/ionicons/ionicons.js"></script>
			<link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/toastify-js/src/toastify.min.css">
			<script type="text/javascript" src="https://cdn.jsdelivr.net/npm/toastify-js"></script>
			<style>
				body { font-family: 'Inter', sans-serif, 'PingFang SC', 'Microsoft YaHei'; }
				.custom-scrollbar::-webkit-scrollbar { width: 6px; }
				.custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
				.custom-scrollbar::-webkit-scrollbar-thumb { background: #9ca3af; border-radius: 3px; }
				.custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #6b7280; }
			</style>
		</head>
		<body class="bg-slate-100 flex items-center justify-center min-h-screen">
			<main class="w-full max-w-6xl mx-auto my-8 bg-white rounded-2xl shadow-xl flex" style="height: 85vh;">
				
				<aside class="w-1/3 border-r border-slate-200 flex flex-col">
					<div class="p-4 border-b border-slate-200">
						<h2 class="text-lg font-semibold text-slate-800 mb-3">您的临时邮箱</h2>
						<div class="relative flex items-center">
							<input id="current-email" type="text" readonly class="w-full bg-slate-100 border border-slate-300 rounded-lg pl-3 pr-10 py-2 text-sm text-slate-700 focus:outline-none">
							<button onclick="copyToClipboard()" class="absolute right-2 p-1 text-slate-500 hover:text-slate-800 transition-colors" title="复制到剪贴板">
								<ion-icon name="clipboard-outline" class="text-lg"></ion-icon>
							</button>
						</div>
						<div class="grid grid-cols-3 gap-2 mt-3">
							<button onclick="generateNewMailbox()" class="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors">
								<ion-icon name="add-circle-outline" class="text-lg"></ion-icon> 新建
							</button>
							<button onclick="startRecovery()" class="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
								<ion-icon name="repeat-outline" class="text-lg"></ion-icon> 恢复
							</button>
							<button onclick="fetchEmails(true)" class="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold bg-slate-500 text-white rounded-lg hover:bg-slate-600 transition-colors">
								<ion-icon name="refresh-outline" class="text-lg"></ion-icon> 刷新
							</button>
						</div>
					</div>
					<div class="flex-grow overflow-y-auto custom-scrollbar">
						<ul id="inbox-list" class="divide-y divide-slate-200">
							</ul>
					</div>
				</aside>

				<section class="w-2/3 flex flex-col">
					<div id="email-placeholder" class="flex-grow flex flex-col items-center justify-center text-slate-400">
						<ion-icon name="mail-outline" class="text-6xl mb-4"></ion-icon>
						<p class="text-lg">请从左侧选择一封邮件进行查看</p>
					</div>
					<div id="email-content-view" class="hidden flex-grow flex flex-col bg-white">
						<div id="email-header" class="p-4 border-b border-slate-200 bg-slate-50">
							</div>
						<iframe id="email-iframe" class="flex-grow w-full border-0"></iframe>
					</div>
				</section>
			</main>

            <div id="recoveryModal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center">
              <div class="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
                <div class="flex justify-between items-center mb-4">
					<h5 class="text-xl font-bold text-slate-800">恢复邮箱</h5>
					<button onclick="closeRecovery()" class="text-slate-400 hover:text-slate-700">
						<ion-icon name="close-outline" class="text-2xl"></ion-icon>
					</button>
				</div>
                <div class="modal-body">
                  <p class="text-slate-600 mb-3">请输入您的恢复码来找回之前的邮箱。</p>
                  <input type="text" id="recovery-key-input" class="w-full border border-slate-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition" placeholder="在此粘贴您的恢复码">
                  <p class="mt-4 text-sm text-slate-600"><strong>您当前的恢复码是:</strong></p>
                  <p id="current-recovery-key" class="text-sm text-slate-800 bg-slate-100 p-2 rounded-lg mt-1 font-mono break-all"></p>
                </div>
                <div class="modal-footer mt-6 flex justify-end gap-3">
                  <button type="button" class="px-4 py-2 bg-slate-200 text-slate-800 rounded-lg hover:bg-slate-300" onclick="closeRecovery()">关闭</button>
                  <button type="button" class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600" onclick="performRecovery()">恢复</button>
                </div>
              </div>
            </div>

			<script>
				const DOMAIN = '${domain}';
				let currentMailboxCode = null; let emailsCache = []; let refreshInterval = null;
                const adjectives=["swift","clever","silent","wise","brave","calm","eager","jolly","kind","lively","nice","proud"];
                const nouns=["fox","river","moon","star","forest","mountain","ocean","cloud","meadow","willow","raven","tiger"];
                
                function generateReadableCode(){const adj=adjectives[Math.floor(Math.random()*adjectives.length)];const noun=nouns[Math.floor(Math.random()*nouns.length)];const num=Math.floor(Math.random()*900)+100;return \`\${adj}-\${noun}-\${num}\`;}
				
                document.addEventListener('DOMContentLoaded',()=>{init();startAutoRefresh();});
				
                function init(){let savedCode=localStorage.getItem('mailboxCode');if(!savedCode){savedCode=generateReadableCode();localStorage.setItem('mailboxCode',savedCode);}setMailbox(savedCode);}
                
                function setMailbox(code){currentMailboxCode=code;const emailAddress=\`\${code}@\${DOMAIN}\`;document.getElementById('current-email').value=emailAddress;document.getElementById('current-recovery-key').textContent=code;fetchEmails();}
                
                function generateNewMailbox(){
					if(confirm('您确定要生成一个新的邮箱吗？当前的邮箱链接将会丢失。')){
						const newCode=generateReadableCode();
						localStorage.setItem('mailboxCode',newCode);
						setMailbox(newCode);
						document.getElementById('inbox-list').innerHTML='';
						showPlaceholder();
					}
				}
				
                async function fetchEmails(isManual=false){
                    if(!currentMailboxCode)return;
                    const refreshBtn = document.querySelector('button[onclick="fetchEmails(true)"]');
                    const originalContent = refreshBtn.innerHTML;
                    if(isManual) {
                        refreshBtn.innerHTML = '<div class="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>';
                        refreshBtn.disabled = true;
                    }
                    try {
                        const response = await fetch(\`/api/emails/\${currentMailboxCode}\`);
                        if(!response.ok) throw new Error('Failed to fetch');
                        const emails=await response.json();
                        emailsCache=emails;
                        renderInbox();
                    } catch(error){console.error('Error fetching emails:',error);}
                    finally {
                        if(isManual) {
                           refreshBtn.innerHTML = originalContent;
                           refreshBtn.disabled = false;
                        }
                    }
                }

				function renderInbox() {
					const inboxList = document.getElementById('inbox-list');
					if (emailsCache.length === 0) {
						inboxList.innerHTML = '<li class="p-8 text-center text-slate-500">您的收件箱是空的</li>';
						return;
					}
					inboxList.innerHTML = emailsCache.map((email, index) => \`
						<li onclick="showEmail(\${index})" class="p-4 cursor-pointer hover:bg-slate-50 transition-colors" data-index="\${index}">
							<div class="flex justify-between items-center">
								<p class="font-semibold text-slate-800 text-sm truncate">\${escapeHtml(email.from_address)}</p>
								<p class="text-xs text-slate-400">\${new Date(email.received_at).toLocaleString('zh-CN')}</p>
							</div>
							<p class="text-sm text-slate-600 truncate">\${escapeHtml(email.subject)}</p>
						</li>
					\`).join('');
				}

				function showEmail(index) {
					const email = emailsCache[index];
					if (!email) return;
                    document.querySelectorAll('#inbox-list li').forEach(li => {
                        li.classList.toggle('bg-blue-50', li.dataset.index == index);
                    });
					document.getElementById('email-placeholder').classList.add('hidden');
					const view = document.getElementById('email-content-view');
                    view.classList.remove('hidden'); view.classList.add('flex');
					const header = document.getElementById('email-header');
                    header.innerHTML = \`<h3 class="font-bold text-lg text-slate-900 truncate">\${escapeHtml(email.subject)}</h3><p class="text-sm text-slate-600 mt-1"><strong>发件人:</strong> \${escapeHtml(email.from_address)}</p>\`;
					const iframe = document.getElementById('email-iframe');
					const content = email.body_html || \`<pre style="white-space: pre-wrap; word-wrap: break-word; padding: 1rem; font-family: monospace;">\${escapeHtml(email.body_text)}</pre>\`;
					iframe.srcdoc = content;
				}

                function showPlaceholder(){document.getElementById('email-placeholder').classList.remove('hidden');const view = document.getElementById('email-content-view');view.classList.add('hidden');view.classList.remove('flex');}
				
                function copyToClipboard(){
					const email=document.getElementById('current-email').value;
					navigator.clipboard.writeText(email).then(() => {
						Toastify({
							text: "邮箱地址已复制到剪贴板",
							duration: 3000,
							gravity: "top", // \`top\` or \`bottom\`
							position: "right", // \`left\`, \`center\` or \`right\`
							stopOnFocus: true, // Prevents dismissing of toast on hover
							style: {
								background: "linear-gradient(to right, #00b09b, #96c93d)",
							},
						}).showToast();
					});
				}
                
                const recoveryModal = document.getElementById('recoveryModal');
                function startRecovery(){ recoveryModal.classList.remove('hidden'); recoveryModal.classList.add('flex'); }
                function closeRecovery(){ recoveryModal.classList.add('hidden'); recoveryModal.classList.remove('flex'); }
                
                function performRecovery(){
                    const key=document.getElementById('recovery-key-input').value.trim();
                    if(key){
                        localStorage.setItem('mailboxCode',key);
                        setMailbox(key);
                        closeRecovery();
                    } else {
						Toastify({ text: "请输入恢复码", gravity: "top", position: "center", style: { background: "#ef4444" } }).showToast();
					}
                }
                function startAutoRefresh(){if(refreshInterval)clearInterval(refreshInterval);setInterval(()=>fetchEmails(), 15000);}
				function escapeHtml(unsafe){if(!unsafe)return'';return unsafe.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");}
			</script>
		</body>
		</html>
	`;
}