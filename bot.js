const { Bot, InlineKeyboard } = require('grammy');
require('dotenv').config();

// Проверка переменных окружения
if (!process.env.TOKEN || !process.env.CHAT_ID) {
	console.error('Ошибка: Не указаны TOKEN или CHAT_ID в .env файле!');
	process.exit(1);
}

const bot = new Bot(process.env.TOKEN);
const userState = {};
const GROUP_ID = process.env.CHAT_ID;

const SESSION_TIMEOUT = 1000 * 60 * 60; // 1 час

setInterval(() => {
	const now = Date.now();
	let cleanedCount = 0;

	for (const userId in userState) {
		if (userState[userId].lastActivity && (now - userState[userId].lastActivity > SESSION_TIMEOUT)) {
			delete userState[userId];
			cleanedCount++;
		}
	}
	if (cleanedCount > 0) {
		console.log(`🧹 GC: Очищено ${cleanedCount} зависших сессий. Текущая память: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);
	}
}, 1000 * 60 * 30);


// Конфигурация топиков
const TOPICS = {
	'3msd': { active: 10, completed: 12 },
	'245msp': { active: 8, completed: 20 },
	'252msp': { active: 2, completed: 14 },
	'752msp': { active: 4, completed: 16 },
	'237tp': { active: 6, completed: 18 },
	other: { active: 10, completed: 12 },
};

// Функция для безопасной отправки сообщений
async function safeReply(ctx, text, options = {}) {
	try {
		await ctx.reply(text, options);
		return true;
	} catch (error) {
		if (
			error.description &&
			error.description.includes('bot was blocked by the user')
		) {
			console.log(`Пользователь ${ctx.from.id} заблокировал бота`);
			delete userState[ctx.from.id];
		} else {
			console.error('Ошибка при отправке сообщения:', error);
		}
		return false;
	}
}

// Функция для отправки сообщения в группу
async function sendToGroup(ctx, message, unit) {
	try {
		const threadId = TOPICS[unit]?.active || TOPICS['other'].active;
		await ctx.api.sendMessage(GROUP_ID, message, {
			message_thread_id: threadId,
			parse_mode: 'HTML',
		});
		return true;
	} catch (error) {
		console.error('Ошибка при отправке в группу:', error);
		await safeReply(
			ctx,
			'⚠️ Ошибка при отправке запроса. Пожалуйста, попробуйте позже.'
		);
		return false;
	}
}

// Меню выбора действий с ботом
async function showMenuSelection(ctx){
	const keyboard = new InlineKeyboard()
		.text('Заказать справку 1421', '/sp1421')
		.row()
		.text('Узнать статус военнослужащего', '/statusvsl')
		.row()
		.text('Установить банковские реквизиты', '/rekvisites')
		.row()
		.text('Установить выплату детям (1110)', '/1110')
		.row()
		.text('Связаться с оператором горячей линии', '/abonent')

	await safeReply(
		ctx,
		'Выберите интересующий вас вопрос:',
		{ reply_markup: keyboard }
	);
}

const menuCommands = ['/sp1421', '/statusvsl', '/rekvisites', '/1110', '/abonent'];
menuCommands.forEach((menuCommand) => {
	bot.callbackQuery(menuCommand, async (ctx) => {
		const userId = ctx.from.id;
		const username = ctx.from.username ? `@${ctx.from.username}` : 'не указан';

		if (!userState[userId]) userState[userId] = { lastActivity: Date.now() };
		else userState[userId].lastActivity = Date.now();

		userState[userId].command = menuCommand;

		if (ctx.chat.type !== 'private') return;
		switch(menuCommand){
			case '/statusvsl':
				userState[userId].step = 'ask_question';
				state = userState[userId];
				if (!state) return;
				await safeReply(ctx, 'Пожалуйста, введите ваш вопрос:');
			break;
			case '/rekvisites':
				userState[userId].step = 'select_unit';
				state = userState[userId];
				console.log(userState[userId].command);
				if (!state) return;
				await showUnitSelection(ctx);
				rekvisites(ctx,state,username);
			break;
			case '/1110':
				userState[userId].step = 'select_unit';
				state = userState[userId];
				console.log(userState[userId].command);
				if (!state) return;
				await showUnitSelection(ctx);
				child1110(ctx,state,username);
			break;
			case '/abonent':
				userState[userId].step = 'ask_question';
				state = userState[userId];
				if (!state) return;
				await safeReply(ctx, 'Пожалуйста, введите ваше обращение к оператору:');
			break;
			case '/sp1421':
				console.log(userState[userId].command);
				userState[userId].step = 'select_unit';
				state = userState[userId];
				if (!state) return;
				await showUnitSelection(ctx);
				sp1421(ctx,state,username);

			break;
		}

	});
});


// Меню выбора войсковой части
async function showUnitSelection(ctx) {
	const keyboard = new InlineKeyboard()
		.text('упр. 3 мсд', 'unit_3msd')
		.row()
		.text('245 мсп', 'unit_245msp')
		.row()
		.text('252 мсп', 'unit_252msp')
		.row()
		.text('752 мсп', 'unit_752msp')
		.row()
		.text('237 тп', 'unit_237tp')
		.row()
		.text('другие', 'unit_other');

	await safeReply(
		ctx,
		'Выберите войсковую часть, в которой хотите обратиться:',
		{ reply_markup: keyboard }
	);
}

const units = ['3msd', '245msp', '252msp', '752msp', '237tp', 'other'];
units.forEach((unit) => {
	bot.callbackQuery(`unit_${unit}`, async (ctx) => {
		const userId = ctx.from.id;
		if (!userState[userId]) userState[userId] = { lastActivity: Date.now() };

		userState[userId].lastActivity = Date.now();
		userState[userId].unit = unit;
		userState[userId].step = 'ask_soldier_fio';

		await safeReply(ctx, 'Введите ФИО военнослужащего:');
		await ctx.answerCallbackQuery();
	});
});


// Обработка команды /statusvsl
async function statusvsl(ctx,state,username){
	state.lastActivity = Date.now();

	try {
		switch (state.step) {
			case 'ask_question':
				if (ctx.message.text.length < 5) {
					await safeReply(
						ctx,
						'Вопрос должен содержать не менее 5 символов. Пожалуйста, введите снова:'
					);
					return;
				}
				state.question = ctx.message.text;
				state.step = 'select_unit';
				await showUnitSelection(ctx);
				break;

			case 'ask_soldier_fio':
				if (ctx.message.text.length < 5) {
					await safeReply(
						ctx,
						'ФИО должно содержать не менее 5 символов. Пожалуйста, введите снова:'
					);
					return;
				}
				state.soldierFio = ctx.message.text;
				state.step = 'ask_soldier_birthdate';
				await safeReply(
					ctx,
					'Введите дату рождения военнослужащего (в формате ДД.ММ.ГГГГ):'
				);
			break;

			case 'ask_soldier_birthdate':
				if (!/^\d{2}\.\d{2}\.\d{4}$/.test(ctx.message.text)) {
					await safeReply(
						ctx,
						'Неверный формат даты. Пожалуйста, введите дату в формате ДД.ММ.ГГГГ:'
					);
					return;
				}
				state.soldierBirthdate = ctx.message.text;
				state.step = 'ask_soldier_number';
				await safeReply(
					ctx,
					'Введите личный номер военнослужащего (если не знаете, отправьте "-"):'
				);
				break;

			case 'ask_soldier_number':
				state.soldierNumber =
					ctx.message.text === '-' ? 'не указан' : ctx.message.text;
				state.step = 'ask_requester_relation';
				await safeReply(
					ctx,
					'Укажите, кем вы являетесь военнослужащему (родственная связь или должность):'
				);
				break;

			case 'ask_requester_relation':
				state.requesterRelation = ctx.message.text;
				state.step = 'ask_requester_fio';
				await safeReply(ctx, 'Введите ваше ФИО:');
				break;

			case 'ask_requester_fio':
				if (ctx.message.text.length < 5) {
					await safeReply(
						ctx,
						'ФИО должно содержать не менее 5 символов. Пожалуйста, введите снова:'
					);
					return;
				}
				state.requesterFio = ctx.message.text;
				state.step = 'ask_requester_phone';
				await safeReply(ctx, 'Введите ваш контактный номер телефона:');
				break;

			case 'ask_requester_phone':
				if (ctx.message.text.length < 5) {
					await safeReply(
						ctx,
						'Номер телефона слишком короткий. Пожалуйста, введите снова:'
					);
					return;
				}
				state.requesterPhone = ctx.message.text;

				const message =
					`📌 Новый запрос - ❔ статус военнослужащего\n\n` +
					`Вопрос: ${state.question}\n\n` +
					`Войсковая часть: ${state.unit}\n\n` +
					`Данные военнослужащего:\n` +
					`ФИО: ${state.soldierFio}\n` +
					`Дата рождения: ${state.soldierBirthdate}\n` +
					`Личный номер: ${state.soldierNumber}\n\n` +
					`Данные заявителя:\n` +
					`Кем приходится: ${state.requesterRelation}\n` +
					`ФИО: ${state.requesterFio}\n` +
					`Телефон: ${state.requesterPhone}\n` +
					`Контакт: ${username}`;

				const success = await sendToGroup(ctx, message, state.unit);
				if (success) {
					await safeReply(
						ctx,
						'✅ Ваш запрос принят. Оператор свяжется с вами в ближайшее время.'
					);

				}
				delete userState[ctx.from.id];
				showMenuSelection(ctx);
				break;
		}
	} catch (error) {
		console.error('Ошибка в обработчике сообщений:', error);
		delete userState[ctx.from.id];
	}
}


// Обработка команды /rekvisites
async function rekvisites(ctx,state,username){
	state.lastActivity = Date.now();
	console.log(state.step);
	try {
		switch (state.step) {
			case 'ask_soldier_fio':
				if (ctx.message.text.length < 5) {
					await safeReply(
						ctx,
						'ФИО должно содержать не менее 5 символов. Пожалуйста, введите снова:'
					);
					return;
				}
			state.soldierFio = ctx.message.text;
				state.step = 'ask_soldier_birthdate';
				await safeReply(
					ctx,
					'Введите дату рождения военнослужащего (в формате ДД.ММ.ГГГГ):'
				);
			break;

			case 'ask_soldier_birthdate':
				if (!/^\d{2}\.\d{2}\.\d{4}$/.test(ctx.message.text)) {
					await safeReply(
						ctx,
						'Неверный формат даты. Пожалуйста, введите дату в формате ДД.ММ.ГГГГ:'
					);
					return;
				}
				state.soldierBirthdate = ctx.message.text;
				state.step = 'ask_soldier_number';
				await safeReply(
					ctx,
					'Введите личный номер военнослужащего (если не знаете, отправьте "-"):'
				);
				break;

			case 'ask_soldier_number':
				state.soldierNumber =
					ctx.message.text === '-' ? 'не указан' : ctx.message.text;
				state.step = 'ask_requester_relation';
				await safeReply(
					ctx,
					'Укажите, кем вы являетесь военнослужащему (родственная связь или должность):'
				);
			break;
			case 'ask_requester_relation':
				state.requesterRelation = ctx.message.text;
				state.step = 'ask_requester_fio';
				await safeReply(ctx, 'Введите ваше ФИО:');
				break;

			case 'ask_requester_fio':
				if (ctx.message.text.length < 5) {
					await safeReply(
						ctx,
						'ФИО должно содержать не менее 5 символов. Пожалуйста, введите снова:'
					);
					return;
				}
				state.requesterFio = ctx.message.text;
				state.step = 'ask_requester_phone';
				await safeReply(ctx, 'Введите ваш контактный номер телефона:');
				break;
			case 'ask_requester_phone':
				if (ctx.message.text.length < 5) {
					await safeReply(
						ctx,
						'Номер телефона слишком короткий. Пожалуйста, введите снова:'
					);
					return;
				}
				state.requesterPhone = ctx.message.text;
				await safeReply(
						ctx,
						'Укажите примечание к обращению по банковским реквезитам.\n'+
						'Если вы не хотите направлять дополнительное сообщение, проставьте "-".'
				);
				state.step = 'send_massage';
			break;
			case 'send_massage' :
				message =''
				state.descriptionMassage = ctx.message.text;
				if(state.descriptionMassage=='-'){
					message =
					`📌 Новый запрос - 💳 банковские реквизиты\n\n` +
					`Войсковая часть: ${state.unit}\n\n` +
					`Данные военнослужащего:\n` +
					`ФИО: ${state.soldierFio}\n` +
					`Дата рождения: ${state.soldierBirthdate}\n` +
					`Личный номер: ${state.soldierNumber}\n\n` +
					`Данные заявителя:\n` +
					`Кем приходится: ${state.requesterRelation}\n` +
					`ФИО: ${state.requesterFio}\n` +
					`Телефон: ${state.requesterPhone}\n` +
					`Контакт: ${username}`;
				}else{
					message =
					`📌 Новый запрос - 💳 банковские реквизиты\n\n` +
					`Войсковая часть: ${state.unit}\n\n` +
					`Данные военнослужащего:\n` +
					`ФИО: ${state.soldierFio}\n` +
					`Дата рождения: ${state.soldierBirthdate}\n` +
					`Личный номер: ${state.soldierNumber}\n\n` +
					`Данные заявителя:\n` +
					`Кем приходится: ${state.requesterRelation}\n` +
					`ФИО: ${state.requesterFio}\n` +
					`Телефон: ${state.requesterPhone}\n` +
					`Дополнение к обращению: ${state.descriptionMassage}\n` +
					`Контакт: ${username}`;
				}
				const success = await sendToGroup(ctx, message, state.unit);
				if (success) {
					await safeReply(
						ctx,
						'✅ Ваш запрос принят. Оператор свяжется с вами в ближайшее время.'
					);
				}
				delete userState[ctx.from.id];
				showMenuSelection(ctx);
				break;
		}
	} catch (error) {
		console.error('Ошибка в обработчике сообщений:', error);
		delete userState[ctx.from.id];
	}

}
// Обработка команды /1110
async function child1110(ctx,state,username){
	state.lastActivity = Date.now();
	console.log(state.step);
	try {
		switch (state.step) {
			case 'ask_soldier_fio':
				if (ctx.message.text.length < 5) {
					await safeReply(
						ctx,
						'ФИО должно содержать не менее 5 символов. Пожалуйста, введите снова:'
					);
					return;
				}
				state.soldierFio = ctx.message.text;
				state.step = 'ask_soldier_birthdate';
				await safeReply(
					ctx,
					'Введите дату рождения военнослужащего (в формате ДД.ММ.ГГГГ):'
				);
			break;

			case 'ask_soldier_birthdate':
				if (!/^\d{2}\.\d{2}\.\d{4}$/.test(ctx.message.text)) {
					await safeReply(
						ctx,
						'Неверный формат даты. Пожалуйста, введите дату в формате ДД.ММ.ГГГГ:'
					);
					return;
				}
				state.soldierBirthdate = ctx.message.text;
				state.step = 'ask_soldier_number';
				await safeReply(
					ctx,
					'Введите личный номер военнослужащего (если не знаете, отправьте "-"):'
				);
				break;

			case 'ask_soldier_number':
				state.soldierNumber =
					ctx.message.text === '-' ? 'не указан' : ctx.message.text;
				state.step = 'ask_requester_relation';
				await safeReply(
					ctx,
					'Укажите, кем вы являетесь военнослужащему (родственная связь или должность):'
				);
				break;
			case 'ask_requester_relation':
				state.requesterRelation = ctx.message.text;
				state.step = 'ask_requester_fio';
				await safeReply(ctx, 'Введите ваше ФИО:');
				break;

			case 'ask_requester_fio':
				if (ctx.message.text.length < 5) {
					await safeReply(
						ctx,
						'ФИО должно содержать не менее 5 символов. Пожалуйста, введите снова:'
					);
					return;
				}
				state.requesterFio = ctx.message.text;
				state.step = 'ask_requester_phone';
				await safeReply(ctx, 'Введите ваш контактный номер телефона:');
				break;
			case 'ask_requester_phone':
				if (ctx.message.text.length < 5) {
					await safeReply(
						ctx,
						'Номер телефона слишком короткий. Пожалуйста, введите снова:'
					);
					return;
				}
				state.requesterPhone = ctx.message.text;
				await safeReply(
						ctx,
						'Перечислите ФИО ваших детей/ребенка (через запятую), что не получают выплаты.'

				);
				state.step = 'child_fullname';
			break;

			case 'child_fullname':
				if (ctx.message.text.length < 5) {
					await safeReply(
						ctx,
						'ФИО слишком короткое. Пожалуйста, введите снова:'
					);
					return;
				}
				state.childFullname = ctx.message.text;
				await safeReply(
						ctx,
						'Перечислите дату рождения вашего ребенка/детей (через запятую), что не получают выплаты.'
				);
				state.step = 'child_birthday';
			break;
			case 'child_birthday':
				state.childBirthday = ctx.message.text;
				await safeReply(
						ctx,
						'Укажите примечание к обращению по банковским реквезитам.\n'+
						'Если вы не хотите направлять дополнительное сообщение, проставьте "-".'
				);
				state.step = 'send_massage';
			break;

			case 'send_massage' :
				message =''
				state.descriptionMassage = ctx.message.text;
				if(state.descriptionMassage=='-'){
					message =
					`📌 Новый запрос - 📝 выплаты на детей военнослужащих\n\n` +
					`Войсковая часть: ${state.unit}\n\n` +
					`Данные военнослужащего:\n` +
					`ФИО: ${state.soldierFio}\n` +
					`Дата рождения: ${state.soldierBirthdate}\n` +
					`Личный номер: ${state.soldierNumber}\n\n` +
					`Данные заявителя:\n` +
					`Кем приходится: ${state.requesterRelation}\n` +
					`ФИО: ${state.requesterFio}\n` +
					`Телефон: ${state.requesterPhone}\n\n` +
					`Данные по ребенку/детям:\n` +
					`ФИО(Ребенка/детей): ${state.childFullname}\n` +
					`Дата рождения(Ребенка/детей): ${state.childBirthday}\n\n` +
					`Справочная информация:\n` +
					`Контакт: ${username}`;
				}else{
					message =
					`📌 Новый запрос - 📝 выплаты на детей военнослужащих\n\n` +
					`Войсковая часть: ${state.unit}\n\n` +
					`Данные военнослужащего:\n` +
					`ФИО: ${state.soldierFio}\n` +
					`Дата рождения: ${state.soldierBirthdate}\n` +
					`Личный номер: ${state.soldierNumber}\n\n` +
					`Данные заявителя:\n` +
					`Кем приходится: ${state.requesterRelation}\n` +
					`ФИО: ${state.requesterFio}\n` +
					`Телефон: ${state.requesterPhone}\n\n` +
					`Данные по ребенку/детям:\n` +
					`ФИО(Ребенка/детей): ${state.childFullname}\n` +
					`Дата рождения(Ребенка/детей): ${state.childBirthday}\n\n` +
					`Справочная информация:\n` +
					`Дополнение к обращению: ${state.descriptionMassage}\n` +
					`Контакт: ${username}`;
				}
				const success = await sendToGroup(ctx, message, state.unit);
				if (success) {
					await safeReply(
						ctx,
						'✅ Ваш запрос принят. Оператор свяжется с вами в ближайшее время.'
					);
				}
				delete userState[ctx.from.id];
				showMenuSelection(ctx);
				break;
		}
	} catch (error) {
		console.error('Ошибка в обработчике сообщений:', error);
		delete userState[ctx.from.id];
	}
}
// Обработка команды /abonent
async function abonent(ctx,state,username){
	state.lastActivity = Date.now();
	try {
		switch (state.step) {
			case 'ask_question':
				if (ctx.message.text.length < 10) {
					await safeReply(
						ctx,
						'Обращение должно содержать не менее 10 символов. Пожалуйста, введите снова:'
					);
					return;
				}
				state.question = ctx.message.text;
				state.step = 'select_unit';
				await showUnitSelection(ctx);
				break;

			case 'ask_soldier_fio':
				if (ctx.message.text.length < 5) {
					await safeReply(
						ctx,
						'ФИО должно содержать не менее 5 символов. Пожалуйста, введите снова:'
					);
					return;
				}
				state.soldierFio = ctx.message.text;
				state.step = 'ask_soldier_birthdate';
				await safeReply(
					ctx,
					'Введите дату рождения военнослужащего (в формате ДД.ММ.ГГГГ):'
				);
			break;

			case 'ask_soldier_birthdate':
				if (!/^\d{2}\.\d{2}\.\d{4}$/.test(ctx.message.text)) {
					await safeReply(
						ctx,
						'Неверный формат даты. Пожалуйста, введите дату в формате ДД.ММ.ГГГГ:'
					);
					return;
				}
				state.soldierBirthdate = ctx.message.text;
				state.step = 'ask_soldier_number';
				await safeReply(
					ctx,
					'Введите личный номер военнослужащего (если не знаете, отправьте "-"):'
				);
				break;

			case 'ask_soldier_number':
				state.soldierNumber =
					ctx.message.text === '-' ? 'не указан' : ctx.message.text;
				state.step = 'ask_requester_relation';
				await safeReply(
					ctx,
					'Укажите, кем вы являетесь военнослужащему (родственная связь или должность):'
				);
				break;

			case 'ask_requester_relation':
				state.requesterRelation = ctx.message.text;
				state.step = 'ask_requester_fio';
				await safeReply(ctx, 'Введите ваше ФИО:');
				break;

			case 'ask_requester_fio':
				if (ctx.message.text.length < 5) {
					await safeReply(
						ctx,
						'ФИО должно содержать не менее 5 символов. Пожалуйста, введите снова:'
					);
					return;
				}
				state.requesterFio = ctx.message.text;
				state.step = 'ask_requester_phone';
				await safeReply(ctx, 'Введите ваш контактный номер телефона:');
				break;

			case 'ask_requester_phone':
				if (ctx.message.text.length < 5) {
					await safeReply(
						ctx,
						'Номер телефона слишком короткий. Пожалуйста, введите снова:'
					);
					return;
				}
				state.requesterPhone = ctx.message.text;

				const message =
					`📌 Новый запрос - ☎️ связь с оператором\n\n` +
					`Обращение: ${state.question}\n\n` +
					`Войсковая часть: ${state.unit}\n\n` +
					`Данные военнослужащего:\n` +
					`ФИО: ${state.soldierFio}\n` +
					`Дата рождения: ${state.soldierBirthdate}\n` +
					`Личный номер: ${state.soldierNumber}\n\n` +
					`Данные заявителя:\n` +
					`Кем приходится: ${state.requesterRelation}\n` +
					`ФИО: ${state.requesterFio}\n` +
					`Телефон: ${state.requesterPhone}\n` +
					`Контакт: ${username}`;

				const success = await sendToGroup(ctx, message, state.unit);
				if (success) {
					await safeReply(
						ctx,
						'✅ Ваш запрос принят. Оператор свяжется с вами в ближайшее время.'
					);
				}
				delete userState[ctx.from.id];
				showMenuSelection(ctx);
				break;
		}
	} catch (error) {
		console.error('Ошибка в обработчике сообщений:', error);
		delete userState[ctx.from.id];
	}
}

// Обработка команды /sp1421
async function sp1421(ctx,state,username){
	state.lastActivity = Date.now();
	console.log(state.step);
	try {
		switch (state.step) {
			case 'ask_soldier_fio':
				if (ctx.message.text.length < 5) {
					await safeReply(
						ctx,
						'ФИО должно содержать не менее 5 символов. Пожалуйста, введите снова:'
					);
					return;
				}
			state.soldierFio = ctx.message.text;
				state.step = 'ask_soldier_birthdate';
				await safeReply(
					ctx,
					'Введите дату рождения военнослужащего (в формате ДД.ММ.ГГГГ):'
				);
			break;

			case 'ask_soldier_birthdate':
				if (!/^\d{2}\.\d{2}\.\d{4}$/.test(ctx.message.text)) {
					await safeReply(
						ctx,
						'Неверный формат даты. Пожалуйста, введите дату в формате ДД.ММ.ГГГГ:'
					);
					return;
				}
				state.soldierBirthdate = ctx.message.text;
				state.step = 'ask_soldier_number';
				await safeReply(
					ctx,
					'Введите личный номер военнослужащего (если не знаете, отправьте "-"):'
				);
				break;

			case 'ask_soldier_number':
				state.soldierNumber =
					ctx.message.text === '-' ? 'не указан' : ctx.message.text;
				state.step = 'ask_requester_relation';
				await safeReply(
					ctx,
					'Укажите, кем вы являетесь военнослужащему (родственная связь или должность):'
				);
				break;
			case 'ask_requester_relation':
				state.requesterRelation = ctx.message.text;
				state.step = 'ask_requester_fio';
				await safeReply(ctx, 'Введите ваше ФИО:');
				break;

			case 'ask_requester_fio':
				if (ctx.message.text.length < 5) {
					await safeReply(
						ctx,
						'ФИО должно содержать не менее 5 символов. Пожалуйста, введите снова:'
					);
					return;
				}
				state.requesterFio = ctx.message.text;
				state.step = 'ask_requester_phone';
				await safeReply(ctx, 'Введите ваш контактный номер телефона:');
				break;
			case 'ask_requester_phone':
				if (ctx.message.text.length < 5) {
					await safeReply(
						ctx,
						'Номер телефона слишком короткий. Пожалуйста, введите снова:'
					);
					return;
				}
				state.requesterPhone = ctx.message.text;
				await safeReply(
						ctx,
						'Укажите примечание к обращению по справке 1421.\n'+
						'Если вы не хотите направлять дополнительное сообщение, проставьте "-".'
				);
				state.step = 'send_massage';
			break;
			case 'send_massage' :
				message =''
				state.descriptionMassage = ctx.message.text;
				if(state.descriptionMassage=='-'){
					message =
					`📌 Новый запрос - 📋 справка 1421\n\n` +
					`Войсковая часть: ${state.unit}\n\n` +
					`Данные военнослужащего:\n` +
					`ФИО: ${state.soldierFio}\n` +
					`Дата рождения: ${state.soldierBirthdate}\n` +
					`Личный номер: ${state.soldierNumber}\n\n` +
					`Данные заявителя:\n` +
					`Кем приходится: ${state.requesterRelation}\n` +
					`ФИО: ${state.requesterFio}\n` +
					`Телефон: ${state.requesterPhone}\n` +
					`Контакт: ${username}`;
				}else{
					message =
					`📌 Новый запрос - 📋 справка 1421\n\n` +
					`Войсковая часть: ${state.unit}\n\n` +
					`Данные военнослужащего:\n` +
					`ФИО: ${state.soldierFio}\n` +
					`Дата рождения: ${state.soldierBirthdate}\n` +
					`Личный номер: ${state.soldierNumber}\n\n` +
					`Данные заявителя:\n` +
					`Кем приходится: ${state.requesterRelation}\n` +
					`ФИО: ${state.requesterFio}\n` +
					`Телефон: ${state.requesterPhone}\n` +
					`Дополнение к обращению: ${state.descriptionMassage}\n` +
					`Контакт: ${username}`;
				}
				const success = await sendToGroup(ctx, message, state.unit);
				if (success) {
					await safeReply(
						ctx,
						'✅ Ваш запрос принят. Оператор свяжется с вами в ближайшее время.'
					);
				}
				delete userState[ctx.from.id];
				showMenuSelection(ctx);
				break;
		}
	} catch (error) {
		console.error('Ошибка в обработчике сообщений:', error);
		delete userState[ctx.from.id];
	}
}

// bot.on('message:text', async (ctx) => {
// 	await safeReply(ctx, '📣⚙️Канал закрыт на технические работы на ближайшие 3 часа!⚙️');
// });


// Обработка команд из сообщений и подтягивание к ним функций
bot.on('message:text', async (ctx) => {
	const userId = ctx.from.id;
	const username = ctx.from.username ? `@${ctx.from.username}` : 'не указан';

	if (ctx.chat.type !== 'private') return;

	if (!userState[userId]) userState[userId] = { lastActivity: Date.now() };
    const state = userState[userId];

	if (ctx.message.text.startsWith('/')) {
        state.command = ctx.message.text;
    }

	switch(state.command){
		// вызов запроса на реквизиты с помощью команды /statusvsl
		case '/statusvsl':
			if(ctx.message.text.startsWith('/')){
				userState[userId] = { step: 'ask_question', lastActivity: Date.now(), command: '/statusvsl' };
				// state = userState[userId];
				await safeReply(ctx, 'Пожалуйста, введите ваш вопрос:');
				if (!state) return;
			}else {
				// state = userState[userId];
				if (!state) return;
				statusvsl(ctx,state,username);
			}
		break;
		// вызов запроса на реквизиты с помощью команды /rekvisites
		case '/rekvisites':
			if(ctx.message.text.startsWith('/')){
				userState[userId] = { step: 'select_unit', lastActivity: Date.now(), command: '/rekvisites' };
				// state = userState[userId];
				console.log(state.command);
				if (!state) return;
				await showUnitSelection(ctx);
			}else{
				// state = userState[userId];
				if (!state) return;
				console.log(state.step);
				rekvisites(ctx,state,username);
			}
		break;
		// вызов запроса по выплатам детям военнослужащих с помощью команды /1110
		case '/1110':
			if(ctx.message.text.startsWith('/')){
				userState[userId] = { step: 'select_unit', lastActivity: Date.now(), command: '/1110' };
				// state = userState[userId];
				console.log(state.command);
				if (!state) return;
				await showUnitSelection(ctx);
			}else{
				// state = userState[userId];
				if (!state) return;
				console.log(state.step);
				child1110(ctx,state,username);
			}
		break;
		// вызов обращение к оператору с помощью команды /abonent
		case '/abonent':
			if(ctx.message.text.startsWith('/')){
				userState[userId] = { step: 'ask_question', lastActivity: Date.now(), command: '/abonent' };
				// state = userState[userId];
				await safeReply(ctx, 'Пожалуйста, введите ваше обращение к оператору:');
				if (!state) return;
			}else {
				// state = userState[userId];
				if (!state) return;
				abonent(ctx,state,username);
			}
		break;
		// вызов обращение к оператору с помощью команды /sp1421
		case '/sp1421':
			if(ctx.message.text.startsWith('/')){
				userState[userId] = { step: 'select_unit', lastActivity: Date.now(), command: '/sp1421' };
				// state = userState[userId];
				console.log(state.command);
				if (!state) return;
				await showUnitSelection(ctx);
			}else{
				// state = userState[userId];
				if (!state) return;
				console.log(state.step);
				sp1421(ctx,state,username);
			}
		break;
		// вызов обращение к оператору с помощью команды /start
		case '/start':
			await ctx.reply(
			"Здравствуйте, Вы обратились на горячую линию 3 мотострелковой дивизии 20 армии Московского военного округа! Тут вы можете уточнить ряд вопросов:"
		);
		await ctx.reply(
			"- ✅ Заказать справку 1421 - данная справка необходима для признания безвестно отсутствующего военнослужащего умершим и оформления социальных выплат\n"+
			"- ✅ Оформить ежемесячную выплату в размере МРОТ в зависимости от регионов детям безвестно отсутствующих военнослужащих, согласно Указа Президента Российской Федерации от 26.12.2024 года №1110\n"+
			"- ✅ Установить банковские реквизиты родственников безвестно отсутствующих военнослужащих для выплаты ежемесячного денежного довольствия\n"+
			"- ✅ Узнать статус военнослужащего или связаться с представителями горячей линии\n"
		);
		userState[userId] = { step: 'select_unit', lastActivity: Date.now() };
		// state = userState[userId];
		if (!userState[userId]) return;
		await showMenuSelection(ctx);
		break;
	}
	return;
});

// Обработчик ошибок
bot.catch((err) => {
	console.error('Ошибка в боте:', err);
});

// Запуск бота
bot
	.start()
	.then(() => console.log('Бот успешно запущен!'))
	.catch((err) => console.error('Ошибка при запуске бота:', err));
