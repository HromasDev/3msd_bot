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
		'Выберите войсковую часть, в которой проходит службу военнослужащего:',
		{ reply_markup: keyboard }
	);
}

const units = ['3msd', '245msp', '252msp', '752msp', '237tp', 'other'];
units.forEach((unit) => {
	bot.callbackQuery(`unit_${unit}`, async (ctx) => {
		const userId = ctx.from.id;
		if (!userState[userId]) userState[userId] = {};

		userState[userId].unit = unit;
		userState[userId].step = 'ask_soldier_fio';

		await safeReply(ctx, 'Введите ФИО военнослужащего:');
		await ctx.answerCallbackQuery();
	});
});

// Обработчик текстовых сообщений
bot.start(async (ctx) => {
		await safeReply(
			ctx,
			'Здравствуйте, Вы обратились на горячую линию 3 мотострелковой дивизии 20 армии Московского военного округа! Тут вы можете уточнить ряд вопросов:'
		);
		await safeReply(
			ctx,
			'- ✅ Заказать справку 1421 - данная справка необходима для признания безвестно отсутствующего \n\n'+
			'военнослужащего умершим и оформления социальных выплат \n\n'+
			'- ✅ Оформить ежемесячную выплату в размере МРОТ в зависимости от регионов детям безвестно отсутствующих военнослужащих, согласно n\n\'
			'Указа Президента Российской Федерации от 26.12.2024 года №1110 n\n\'+
			'- ✅ Установить банковские реквизиты родственников безвестно отсутствующих военнослужащих n\n\'+
			'для выплаты ежемесячного денежного довольствия'+
			'- ✅ Узнать статус военнослужащего или связаться с представителями горячей линии'
		);

});

bot.command("statusvsl",async (ctx) => {
	const userId = ctx.from.id;
	const state = userState[userId];
	const username = ctx.from.username ? `@${ctx.from.username}` : 'не указан';

	if (ctx.chat.type !== 'private') return;
	userState[userId] = { step: 'ask_question' };

	await safeReply(
		ctx,
		'Пожалуйста, введите ваш вопрос:'
	);
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
					`📌 Новый запрос - связь с оператором горячей линии` +
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
				delete userState[userId];
				break;
		}
	} catch (error) {
		console.error('Ошибка в обработчике сообщений:', error);
		delete userState[userId];
	}

});

bot.command("rekvisites",async (ctx) => {
	await safeReply(
		ctx,
		'Реквизиты находятся в разработке'
	);
});

bot.command("1110",async (ctx) => {
	await safeReply(
		ctx,
		'Установоление выплат детям в разработке'
	);
});

bot.command("abonent",async (ctx) => {
	await safeReply(
		ctx,
		'Список операторов горячей линии:'
	);
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
