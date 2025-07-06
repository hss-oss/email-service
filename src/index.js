export default {
    /**
     * HTTP fetch handler:
     * - 检查管理员身份
     * - 路由 API 请求
     * - 渲染不同权限的前端页面
     */
    async fetch(request, env) {
        const url = new URL(request.url);
        const path = url.pathname;

        // 检查是否为管理员访问
        const isAdmin = url.searchParams.get('admin') === env.ADMIN_UUID;

        // --- API 路由 ---
        // 验证邮箱码是否存在 (公开)
        const validateMatch = path.match(/^\/api\/validate\/([a-zA-Z0-9\-]+)$/);
        if (validateMatch) {
            const mailboxCode = validateMatch[1];
            return this.handleValidateRequest(mailboxCode, env);
        }

        // 获取邮件列表 (公开)
        const emailsMatch = path.match(/^\/api\/emails\/([a-zA-Z0-9\-]+)$/);
        if (emailsMatch) {
            const mailboxCode = emailsMatch[1];
            return this.handleEmailsRequest(mailboxCode, env);
        }

        // 创建新邮箱 (仅限管理员)
        if (path === '/api/mailbox/new' && request.method === 'POST') {
            // 注意：这里的 isAdmin 是根据 API 请求的 URL 重新判断的
            if (!isAdmin) {
                return new Response('Forbidden', { status: 403 });
            }
            return this.handleNewMailboxRequest(env);
        }

        // --- 主页面渲染 ---
        const domain = env.MY_DOMAIN;
        if (!domain) {
            return new Response('Server configuration error: MY_DOMAIN is not set.', { status: 500 });
        }
        
        // 将 isAdmin 状态传递给前端，以渲染不同视图
        return new Response(generateAppHtml(domain, isAdmin), {
            headers: { 'Content-Type': 'text/html;charset=UTF-8' },
        });
    },

    /**
     * API: 验证邮箱码是否存在
     */
    async handleValidateRequest(mailboxCode, env) {
        try {
            const stmt = env.DB.prepare('SELECT id FROM emails WHERE mailbox_code = ? LIMIT 1');
            const result = await stmt.bind(mailboxCode).first();
            return new Response(JSON.stringify({ exists: !!result }), {
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (e) {
            return new Response(JSON.stringify({ error: 'Database error' }), { status: 500 });
        }
    },

    /**
     * API: 获取邮件列表
     */
    async handleEmailsRequest(mailboxCode, env) {
        try {
            const stmt = env.DB.prepare('SELECT from_address, subject, received_at, body_html, body_text FROM emails WHERE mailbox_code = ? ORDER BY received_at DESC');
            const { results } = await stmt.bind(mailboxCode).all();
            return new Response(JSON.stringify(results), { headers: { 'Content-Type': 'application/json' } });
        } catch (e) { return new Response(JSON.stringify({ error: 'Failed to fetch emails' }), { status: 500 }); }
    },

    /**
     * API: 创建新邮箱 (仅限管理员)
     */
    async handleNewMailboxRequest(env) {
        // 在服务器端生成代码，保证唯一性和安全性
        const adjectives = ["swift", "clever", "silent", "wise", "brave", "calm", "eager", "jolly", "kind", "lively", "nice", "proud"];
        const nouns = ["fox", "river", "moon", "star", "forest", "mountain", "ocean", "cloud", "meadow", "willow", "raven", "tiger"];
        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        const num = Math.floor(Math.random() * 900) + 100;
        const newCode = `${adj}-${noun}-${num}`;
        
        return new Response(JSON.stringify({ new_code: newCode }), {
            headers: { 'Content-Type': 'application/json' },
        });
    },

    /**
     * Email handler: 接收邮件并存入数据库
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
 * 根据是否为管理员，生成不同权限的前端页面
 * @param {string} domain - 从环境变量中传入的域名
 * @param {boolean} isAdmin - 是否为管理员
 */
function generateAppHtml(domain, isAdmin) {
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
				
				<!-- 主应用界面 -->
				<main id="app-main" class="w-full max-w-6xl mx-auto my-8 bg-white rounded-2xl shadow-xl flex" style="height: 85vh;">
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
								${isAdmin ? `
								<button onclick="generateNewMailbox()" class="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors">
									<ion-icon name="add-circle-outline" class="text-lg"></ion-icon> 新建
								</button>
								<button onclick="startRecovery()" class="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">
									<ion-icon name="repeat-outline" class="text-lg"></ion-icon> 恢复
								</button>
								` : ''}
								<button onclick="fetchEmails(true)" class="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold bg-slate-500 text-white rounded-lg hover:bg-slate-600 transition-colors ${!isAdmin ? 'col-span-3' : ''}">
									<ion-icon name="refresh-outline" class="text-lg"></ion-icon> 刷新
								</button>
							</div>
						</div>
						<div class="flex-grow overflow-y-auto custom-scrollbar">
							<ul id="inbox-list" class="divide-y divide-slate-200"></ul>
						</div>
					</aside>
					<section class="w-2/3 flex flex-col">
						<div id="email-placeholder" class="flex-grow flex flex-col items-center justify-center text-slate-400">
							<ion-icon name="mail-outline" class="text-6xl mb-4"></ion-icon>
							<p class="text-lg">请从左侧选择一封邮件进行查看</p>
						</div>
						<div id="email-content-view" class="hidden flex-grow flex flex-col bg-white">
							<div id="email-header" class="p-4 border-b border-slate-200 bg-slate-50"></div>
							<iframe id="email-iframe" class="flex-grow w-full border-0"></iframe>
						</div>
					</section>
				</main>

				<!-- 管理员恢复邮箱模态框 -->
				${isAdmin ? `
				<div id="recoveryModal" class="fixed inset-0 bg-black bg-opacity-50 hidden items-center justify-center">
				  <div class="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
					<div class="flex justify-between items-center mb-4">
						<h5 class="text-xl font-bold text-slate-800">恢复邮箱</h5>
						<button onclick="closeRecovery()" class="text-slate-400 hover:text-slate-700">
							<ion-icon name="close-outline" class="text-2xl"></ion-icon>
						</button>
					</div>
					<div class="modal-body">
					  <p class="text-slate-600 mb-3">请输入恢复码来找回任意邮箱。</p>
					  <input type="text" id="recovery-key-input" class="w-full border border-slate-300 rounded-lg p-2" placeholder="在此粘贴恢复码">
					</div>
					<div class="modal-footer mt-6 flex justify-end gap-3">
						<button type="button" class="px-4 py-2 bg-slate-200 text-slate-800 rounded-lg" onclick="closeRecovery()">关闭</button>
						<button type="button" class="px-4 py-2 bg-blue-500 text-white rounded-lg" onclick="performRecovery()">恢复</button>
					</div>
				  </div>
				</div>` : ''}

				<!-- 普通用户登录模态框 -->
				<div id="loginModal" class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center ${isAdmin ? 'hidden' : ''}">
					<div class="bg-white rounded-xl shadow-2xl p-8 w-full max-w-sm text-center">
						<h5 class="text-2xl font-bold text-slate-800 mb-2">欢迎使用临时邮箱</h5>
						<p class="text-slate-600 mb-6">请输入您的邮箱码以继续。</p>
						<input type="text" id="login-key-input" class="w-full border border-slate-300 rounded-lg p-3 text-center text-lg tracking-wider" placeholder="例如: clever-fox-123">
						<button id="login-button" class="mt-6 w-full px-4 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-all">进入邮箱</button>
						<p id="login-error" class="text-red-500 text-sm mt-3 h-4"></p>
					</div>
				</div>

				<script>
					const DOMAIN = '${domain}';
					const IS_ADMIN = ${isAdmin};
					let currentMailboxCode = null; let emailsCache = []; let refreshInterval = null;
					
					// ⬇️ 修改点 1：在页面加载时，从 URL 中获取 admin UUID
					const urlParams = new URLSearchParams(window.location.search);
                    const adminUUID = urlParams.get('admin');

					// --- 初始化逻辑 ---
					document.addEventListener('DOMContentLoaded', () => {
						if (IS_ADMIN) {
							let savedCode = localStorage.getItem('adminLastMailboxCode');
							if (!savedCode) {
								generateNewMailbox(false); 
							} else {
								setMailbox(savedCode);
							}
						} else {
							document.getElementById('app-main').style.filter = 'blur(5px)';
							document.getElementById('login-button').onclick = performLogin;
							document.getElementById('login-key-input').onkeyup = (e) => { if (e.key === 'Enter') performLogin(); };
						}
						startAutoRefresh();
					});

					// --- 核心功能函数 ---
					function setMailbox(code) {
						currentMailboxCode = code;
						localStorage.setItem(IS_ADMIN ? 'adminLastMailboxCode' : 'userMailboxCode', code);
						const emailAddress = \`\${code}@\${DOMAIN}\`;
						document.getElementById('current-email').value = emailAddress;
						fetchEmails();
					}

					async function fetchEmails(isManual=false){
						if(!currentMailboxCode) return;
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
							<li onclick="showEmail(\${index})" class="p-4 cursor-pointer hover:bg-slate-50" data-index="\${index}">
								<div class="flex justify-between items-center"><p class="font-semibold text-slate-800 text-sm truncate">\${escapeHtml(email.from_address)}</p><p class="text-xs text-slate-400">\${new Date(email.received_at.replace(' ', 'T') + 'Z').toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p></div>
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

					// --- 管理员专属功能 ---
					async function generateNewMailbox(confirmFirst = true) {
						if (!IS_ADMIN) return; // 双重保险
						if (confirmFirst && !confirm('您确定要生成一个新的邮箱吗？')) return;
						try {
							// ⬇️ 修改点 2：在 API 请求中附带 admin UUID
							const apiUrl = \`/api/mailbox/new?admin=\${adminUUID}\`;
							const response = await fetch(apiUrl, { method: 'POST' });

							if (!response.ok) {
								throw new Error(\`Server responded with \${response.status}\`);
							}

							const data = await response.json();
							if (data.new_code) {
								setMailbox(data.new_code);
								document.getElementById('inbox-list').innerHTML = '';
								showPlaceholder();
							}
						} catch(e) { 
							console.error("Failed to generate new mailbox", e);
							Toastify({ text: "创建新邮箱失败，请检查权限或网络。", gravity: "top", position: "center", style: { background: "#ef4444" } }).showToast();
						}
					}

					function startRecovery(){ document.getElementById('recoveryModal').classList.remove('hidden'); document.getElementById('recoveryModal').classList.add('flex'); }
					function closeRecovery(){ document.getElementById('recoveryModal').classList.add('hidden'); document.getElementById('recoveryModal').classList.remove('flex'); }
					function performRecovery(){
						const key = document.getElementById('recovery-key-input').value.trim();
						if (key) {
							setMailbox(key);
							closeRecovery();
						}
					}
					
					// --- 普通用户登录功能 ---
					async function performLogin() {
						const loginInput = document.getElementById('login-key-input');
						const loginError = document.getElementById('login-error');
						const code = loginInput.value.trim();
						if (!code) {
							loginError.textContent = '请输入邮箱码。';
							return;
						}
						try {
							const response = await fetch(\`/api/validate/\${code}\`);
							const data = await response.json();
							if (data.exists) {
								document.getElementById('loginModal').classList.add('hidden');
								document.getElementById('app-main').style.filter = 'none';
								setMailbox(code);
							} else {
								loginError.textContent = '邮箱码不存在或暂无邮件，请确认。';
							}
						} catch (e) {
							loginError.textContent = '验证时发生错误，请稍后重试。';
						}
					}

					// --- 通用辅助函数 ---
					function copyToClipboard(){
						const email = document.getElementById('current-email').value;
						navigator.clipboard.writeText(email).then(() => {
							Toastify({ text: "邮箱地址已复制到剪贴板", duration: 3000, gravity: "top", position: "right", style: { background: "linear-gradient(to right, #00b09b, #96c93d)" }}).showToast();
						});
					}
					function startAutoRefresh(){
						if (refreshInterval) clearInterval(refreshInterval);
						setInterval(() => fetchEmails(), 15000);
					}
					function escapeHtml(unsafe){
						if(!unsafe) return '';
						return unsafe.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
					}
					function showPlaceholder(){
						document.getElementById('email-placeholder').classList.remove('hidden');
						const view = document.getElementById('email-content-view');
						view.classList.add('hidden');
						view.classList.remove('flex');
					}
				</script>
			</body>
		</html>
	`;
}