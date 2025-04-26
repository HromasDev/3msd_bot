const { Bot, InlineKeyboard } = require('grammy');
require('dotenv').config();

const bot = new Bot(process.env.TOKEN); // Токен бота

const userState = {};

// ID группы и тем
const GROUP_ID = process.env.CHAT_ID; // Основной chat_id группы

// ID топиков
const TOPICS = {
	// топик упр. 3 мсд и другие
	'3msd': {
		active: 10,
		completed: 12,
	},
	// топик 245 мсп
	'245msp': {
		active: 8,
		completed: 20,
	},
	// топик 252 мсп
	'252msp': {
		active: 2,
		completed: 14,
	},
	// топик 752 мсп
	'752msp': {
		active: 4,
		completed: 16,
	},
	// топик 237 тп
	'237tp': {
		active: 6,
		completed: 18,
	},
};

async function askQuestion(ctx) {
	const keyboard = new InlineKeyboard().text(
		'Выбрать войсковую часть',
		'select_unit'
	);

	await ctx.reply('Пожалуйста, выберите интересующий вас вопрос:', {
		reply_markup: keyboard,
	});
}

// Обработчик выбора части
bot.callbackQuery('select_unit', async (ctx) => {
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
		.text('другие', 'unit_3msd');

	await ctx.reply(
		'Выберите войсковую часть, в которой проходит службу военнослужащего:',
		{
			reply_markup: keyboard,
		}
	);
});

// Обработчики выбора части
const units = ['3msd', '245msp', '252msp', '752msp', '237tp', '3msd'];
units.forEach((unit) => {
	bot.callbackQuery(`unit_${unit}`, async (ctx) => {
		const userId = ctx.from.id;
		userState[userId] = {
			unit: unit,
			step: 'ask_soldier_fio',
		};
		await ctx.reply('Введите ФИО военнослужащего:');
		await ctx.answerCallbackQuery();
	});
});

bot.on('message:text', async (ctx) => {
	const userId = ctx.from.id;
	const state = userState[userId];
	const username = ctx.from.username ? `@${ctx.from.username}` : 'не указан';

	if (ctx.message.text.startsWith('/')) {
		await ctx.reply(
			'Здравствуйте, вы обратились на горячую линию 3 мотострелковой дивизии 20 гвардейской общевойсковой армии Московского военного округа!'
		);
		await askQuestion(ctx);
	}
	if (!state) return;

	if (state.step === 'ask_soldier_fio') {
		if (ctx.message.text.length < 5) {
			return await ctx.reply(
				'ФИО должно содержать не менее 5 символов. Пожалуйста, введите снова:'
			);
		}
		state.soldierFio = ctx.message.text;
		state.step = 'ask_soldier_birthdate';
		await ctx.reply(
			'Введите дату рождения военнослужащего (в формате ДД.ММ.ГГГГ):'
		);
	} else if (state.step === 'ask_soldier_birthdate') {
		// Простая проверка формата даты (можно улучшить)
		if (!/^\d{2}\.\d{2}\.\d{4}$/.test(ctx.message.text)) {
			return await ctx.reply(
				'Неверный формат даты. Пожалуйста, введите дату в формате ДД.ММ.ГГГГ:'
			);
		}
		state.soldierBirthdate = ctx.message.text;
		state.step = 'ask_soldier_number';
		await ctx.reply(
			'Введите личный номер военнослужащего (если не знаете, отправьте "-"):'
		);
	} else if (state.step === 'ask_soldier_number') {
		state.soldierNumber =
			ctx.message.text === '-' ? 'не указан' : ctx.message.text;
		state.step = 'ask_requester_relation';
		await ctx.reply(
			'Укажите, кем вы являетесь военнослужащему (родственная связь или должность):'
		);
	} else if (state.step === 'ask_requester_relation') {
		state.requesterRelation = ctx.message.text;
		state.step = 'ask_requester_fio';
		await ctx.reply('Введите ваше ФИО:');
	} else if (state.step === 'ask_requester_fio') {
		if (ctx.message.text.length < 5) {
			return await ctx.reply(
				'ФИО должно содержать не менее 5 символов. Пожалуйста, введите снова:'
			);
		}
		state.requesterFio = ctx.message.text;
		state.step = 'ask_requester_phone';
		await ctx.reply('Введите ваш контактный номер телефона:');
	} else if (state.step === 'ask_requester_phone') {
		// Простая проверка номера телефона (можно улучшить)
		if (ctx.message.text.length < 5) {
			return await ctx.reply(
				'Номер телефона слишком короткий. Пожалуйста, введите снова:'
			);
		}
		state.requesterPhone = ctx.message.text;

		// Формируем сообщение для группы
		const message =
			`📌 Новый запрос\n\n` +
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

		const threadId = TOPICS[state.unit]?.active || TOPICS['other'].active;
		await ctx.api.sendMessage(GROUP_ID, message, {
			message_thread_id: threadId,
			parse_mode: 'HTML',
		});

		await ctx.reply(
			'✅ Ваш запрос принят. Оператор свяжется с вами в ближайшее время.'
		);
		delete userState[userId];
	}
});

bot.start();
console.log('Бот запущен!');
