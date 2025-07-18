import {CronJob} from "cron";
import {listWithTitle, reportError} from "./bot";
import {config} from "./config";
import dayjs, {ManipulateType} from "dayjs";
import {getActiveDeadlines, getAllDeadlines} from "./model";
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

const cronJobs = [
    new CronJob(
        '0 10 * * *',
        async () => {
            try {
                const deadlines = (await getActiveDeadlines()).filter(it => it.datetime.isSame(dayjs(), 'date'));
                if (deadlines.length === 0) {
                    return;
                }
                await listWithTitle(config.CHAT_ID,
                    "‼️ Сегодняшние встречи:",
                    deadlines
                )
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
                await listWithTitle(config.CHAT_ID,
                    "‼️ Встречи на следующей неделе:",
                    deadlines
                )
            } catch (e: unknown) {
                await reportError(e, config.CHAT_ID, 'cron: 0 20 * * 6')
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
                        await listWithTitle(config.CHAT_ID,
                            remind.name,
                            remindList
                        )
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