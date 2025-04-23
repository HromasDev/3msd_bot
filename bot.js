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

bot.command('abonent', async (ctx) => {
	await ctx.reply(
		'Здравствуйте, вы обратились на горячую линию 3 мотострелковой дивизии 20 гвардейской общевойсковой армии Московского военного округа!'
	);
	await askQuestion(ctx);
});

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
		.text('другие', 'unit_other');

	await ctx.reply(
		'Выберите войсковую часть, в которой проходит службу военнослужащего:',
		{
			reply_markup: keyboard,
		}
	);
});

// Обработчики выбора части
const units = ['3msd', '245msp', '252msp', '752msp', '237tp', 'other'];
units.forEach((unit) => {
	bot.callbackQuery(`unit_${unit}`, async (ctx) => {
		const userId = ctx.from.id;
		userState[userId] = {
			unit: unit,
			step: 'ask_soldier_info',
		};
		await ctx.reply(
			'Заполните сведения военнослужащего:\nФ.И.О., Дата рождения, личный номер\n(если не знаете личный номер, оставьте пустую строку)'
		);
		await ctx.answerCallbackQuery();
	});
});

bot.on('message:text', async (ctx) => {
	const userId = ctx.from.id;
	const state = userState[userId];

	if (!state) return;

	if (state.step === 'ask_soldier_info') {
		state.soldierInfo = ctx.message.text;
		state.step = 'ask_requester_info';
		await ctx.reply(
			'Укажите, кем вы являетесь военнослужащему, и свои персональные данные (Ф.И.О., контактный номер для связи):'
		);
	} else if (state.step === 'ask_requester_info') {
		state.requesterInfo = ctx.message.text;

		// формируем сообщение
		const message =
			`📌 **Новый запрос**\n\n` +
			`**Войсковая часть:** ${state.unit}\n\n` +
			`**Данные военнослужащего:**\n${state.soldierInfo}\n\n` +
			`**Данные заявителя:**\n${state.requesterInfo}`;

		const threadId = TOPICS[state.unit].active || TOPICS['other'].active;
		await ctx.api.sendMessage(GROUP_ID, message, {
			message_thread_id: threadId,
			parse_mode: 'Markdown',
		});

		await ctx.reply(
			'✅ Ваш запрос принят. Оператор свяжется с вами в ближайшее время.'
		);
		delete userState[userId];
	}
});

bot.start();
console.log('Бот запущен!');
