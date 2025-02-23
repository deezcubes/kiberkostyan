import {marked, Tokens} from "marked";
import dayjs from "dayjs";
import {Deadline, fetchDeadlines} from "./api";
import sanitizeHtml from "sanitize-html";
import {DeadlineMqDto} from "./mq";
import _ from 'lodash'

marked.use({
    tokenizer: {
        list(): Tokens.List | undefined {
            return undefined
        }
    }
})

export interface DeadlineDto {
    id: number,
    name: string,
    subject: string | null,
    datetime: dayjs.Dayjs,
    comment: string | null,
    link: string | null
}

function formatComment(comment: (string | null)): string | null {
    return comment
        ? sanitizeHtml(marked.parse(comment) as string, {allowedTags: ['b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'span', 'tg-spoiler', 'a', 'tg-emoji', 'code', 'pre', 'blockquote']})
        : null
}

function mapDeadline(id: number, deadline: Deadline): DeadlineDto {
    return {
        id,
        name: deadline.name,
        subject: deadline.subject?.data?.attributes?.name ?? null,
        datetime: dayjs(deadline.datetime),
        comment: formatComment(deadline.comment ?? null),
        link: deadline.link ?? null
    };
}

export function mapMqDeadeline(deadline: DeadlineMqDto): DeadlineDto {
    return {
        id: deadline.id,
        name: deadline.name,
        subject: deadline.subject,
        datetime: dayjs(deadline.datetime),
        comment: formatComment(deadline.comment),
        link: deadline.link
    }
}

export async function getAllDeadlines() {
    const apiDeadlines = await fetchDeadlines()
    return apiDeadlines.map(deadline => mapDeadline(<number>deadline.id, <Deadline>deadline.attributes))
}

export async function getActiveDeadlines() {
    const allDeadlines = await getAllDeadlines()
    const now = dayjs()
    return _(allDeadlines).filter(it => it.datetime.isAfter(now)).sortBy(it => it.datetime.unix()).value()
}


export function formatDeadline(deadline: DeadlineDto): string {
    return `` + `<b>${deadline.subject ?? 'неизвестная хуйня'}</b> - ${deadline.name}
⏰ ${deadline.datetime.format('DD.MM.YY HH:mm')} <i>(${deadline.datetime.fromNow()})</i>
` + (deadline.link ? `🔗 <a href="${deadline.link}">Ссылка</a>` + '\n' : ``) + (deadline.comment ?? ``)
}

export function formatDeadlines(deadlines: DeadlineDto[], offset: number = 0): string {
    if (deadlines.length === 0) {
        return 'ничево нет...'
    }
    return deadlines.map((curr, idx) => String(offset + idx + 1) + '. ' + formatDeadline(curr)).join('\n\n')
}