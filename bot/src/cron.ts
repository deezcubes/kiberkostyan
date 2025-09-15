import {CronJob} from "cron";
import {listWithTitle, reportError} from "./bot";
import {config} from "./config";
import dayjs, {ManipulateType} from "dayjs";
import {DeadlineDto, getActiveDeadlines, getAllDeadlines} from "./model";
import fs from "node:fs";

interface Reminder {
    value: number,
    unit: ManipulateType,
    name: string
}

function getReminderId(reminder: Reminder): string {
    return String(reminder.value) + '_' + reminder.unit
}

const remindersConfig: Reminder[] = [
    {value: 0, unit: 'minute', name: '‼️ Прямо сейчас начинаются встречи:'},
    {value: 1, unit: 'hour', name: '‼️ Через час начнутся встречи:'},
]

interface FileData {
    [key: string]: number[]
}

const FILE_DATA_PATH = './data/remind.json'

function readFileData(): FileData {
    if (!fs.existsSync(FILE_DATA_PATH)) {
        return {}
    }

    const rawData = fs.readFileSync(FILE_DATA_PATH, 'utf-8');
    return <FileData>JSON.parse(rawData);
}

function writeFileData(data: FileData) {
    fs.writeFileSync(FILE_DATA_PATH, JSON.stringify(data), 'utf-8')
}

function deadlinesToMap(deadlines: DeadlineDto[]) {
    return deadlines.reduce((acc, item) => {
        const chatId = item.chat_id ?? config.CHAT_ID;
        if (!acc.has(chatId)) {
            acc.set(chatId, []); // Initialize an empty array for the new category
        }
        acc.get(chatId)?.push(item); // Add the value to the corresponding category array
        return acc;
    }, new Map<number, DeadlineDto[]>())
}

const cronJobs = [
    new CronJob(
        '0 10 * * *',
        async () => {
            try {
                const deadlines = (await getActiveDeadlines()).filter(it => it.datetime.isSame(dayjs(), 'date'));
                if (deadlines.length === 0) {
                    return;
                }
                const deadlinesMap = deadlinesToMap(deadlines);

                for (const chatId of deadlinesMap.keys()) {
                    await listWithTitle(chatId,
                        "‼️ Сегодняшние встречи:",
                        deadlinesMap.get(chatId) ?? []
                    )
                }

            } catch (e: unknown) {
                await reportError(e, config.CHAT_ID, 'cron: 0 10 * * *')
            }
        }
    ),
    new CronJob(
        '0 20 * * 7',
        async () => {
            try {
                const deadlines = (await getActiveDeadlines()).filter(it => it.datetime.isBefore(
                        dayjs().add(7, 'day').add(4, 'hour')));
                if (deadlines.length === 0) {
                    return;
                }
                const deadlinesMap = deadlinesToMap(deadlines);

                for (const chatId of deadlinesMap.keys()) {
                    await listWithTitle(chatId,
                        "‼️ Встречи на следующей неделе:",
                        deadlinesMap.get(chatId) ?? []
                    )
                }

            } catch (e: unknown) {
                await reportError(e, config.CHAT_ID, 'cron: 0 20 * * 7')
            }
        }
    ),
    new CronJob(
        '* * * * *',
        async () => {
            try {
                const deadlines = await getAllDeadlines();
                const jsonData = readFileData()
                for (const remind of remindersConfig) {
                    const reminderId = getReminderId(remind)
                    if (!(reminderId in jsonData)) {
                        jsonData[reminderId] = []
                    }
                    const deadlineList = <number[]>jsonData[reminderId]
                    const remindList = deadlines.filter(
                        d => d.datetime.isBefore(
                            dayjs().add(remind.value, remind.unit)
                        )
                    ).filter(d => !deadlineList.includes(d.id));
                    deadlineList.push(...remindList.map(it => it.id))
                    if (remindList.length !== 0) {
                        const deadlinesMap = deadlinesToMap(remindList);

                        for (const chatId of deadlinesMap.keys()) {
                            await listWithTitle(chatId,
                                remind.name,
                                deadlinesMap.get(chatId) ?? []
                            )
                        }

                    }
                }
                writeFileData(jsonData)
            } catch (e: unknown) {
                await reportError(e, config.CHAT_ID, 'Обновление дедлайнов')
            }
        }
    ),
]

export function startJobs() {
    cronJobs.forEach(it => {
        it.start();
    })
}