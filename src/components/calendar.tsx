"use client";
import { useState } from "react";
import { dictionaries, type Locale } from "./messages";

// This reproducible pattern is a UI fixture, never satellite data or harmonization.
export const demoCalendar = {
  is_demo: true,
  years: [2025, 2024, 2023, 2022, 2021, 2020],
} as const;
export function Calendar({
  locale,
  example = false,
}: {
  locale: Locale;
  example?: boolean;
}) {
  const t = dictionaries[locale];
  const [selected, setSelected] = useState<{
    year: number;
    month: number;
    level: number;
  } | null>(example ? { year: 2025, month: 2, level: 3 } : null);
  return (
    <section className="calendar-card" aria-labelledby="calendar-title">
      <div className="card-heading">
        <div>
          <p className="eyebrow">{t.demo}</p>
          <h2 id="calendar-title">{t.calendarTitle}</h2>
          <p>{t.calendarSubtitle}</p>
        </div>
        <span className="orbit" aria-hidden="true">
          ↗
        </span>
      </div>
      <p className="demo-note">{t.demoNotice}</p>
      <div
        className="calendar-scroll"
        tabIndex={0}
        role="region"
        aria-label={t.calendarLabel}
      >
        <table>
          <caption className="sr-only">{t.calendarLabel}</caption>
          <thead>
            <tr>
              <th scope="col">{t.year}</th>
              {t.months.map((month) => (
                <th scope="col" key={month}>
                  {month}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {demoCalendar.years.map((year, row) => (
              <tr key={year}>
                <th scope="row">{year}</th>
                {t.months.map((month, index) => {
                  const level =
                    index === 2 && row === 0
                      ? 3
                      : (index * 7 + row * 3 + (index < 5 ? row + 2 : 0)) % 4;
                  return (
                    <td key={month}>
                      <button
                        className={`heat level-${level}`}
                        aria-label={`${month} ${year}: ${t.levels[level]}`}
                        aria-pressed={
                          selected?.year === year && selected.month === index
                        }
                        onClick={() =>
                          setSelected({ year, month: index, level })
                        }
                      >
                        <span aria-hidden="true">
                          {["·", "−", "+", "◆"][level]}
                        </span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="legend">
        <span>{t.less}</span>
        <div aria-hidden="true">
          {[0, 1, 2, 3].map((level) => (
            <i className={`level-${level}`} key={level} />
          ))}
        </div>
        <span>{t.more}</span>
      </div>
      <div className="month-detail" aria-live="polite">
        {selected ? (
          <>
            <h3>
              {t.detail} · {t.months[selected.month]} {selected.year}
            </h3>
            <p>{t.levels[selected.level]}</p>
            <p>{t.detailNote}</p>
          </>
        ) : (
          <p>{t.select}</p>
        )}
      </div>
    </section>
  );
}
