"use client";
import { Icon } from "./icon";
import { dictionaries, type Locale } from "./messages";

// Reproducible UI fixture. It is never satellite data or a harmonized index.
export const demoYears = [2025, 2024, 2023, 2022, 2021, 2020] as const;

export type MonthSelection = {
  year: number;
  month: number;
  level: number;
  days: number;
  daily: number[];
  total: number;
};

export function monthLevel(year: number, month: number) {
  const row = demoYears.indexOf(year as (typeof demoYears)[number]);
  const safeRow = row < 0 ? 0 : row;
  return (month * 7 + safeRow * 3 + (month < 5 ? safeRow + 2 : 0)) % 4;
}

export function createMonthSelection(
  year: number,
  month: number,
): MonthSelection {
  const level = monthLevel(year, month);
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const daily = Array.from({ length: days }, (_, index) => {
    const seed = (year * 13 + month * 17 + (index + 1) * 7 + level * 5) % 11;
    if (level === 0) return seed > 8 ? 1 : 0;
    return (seed % (level + 2)) + (seed % 4 === 0 ? 1 : 0);
  });
  return {
    year,
    month,
    level,
    days,
    daily,
    total: daily.reduce((sum, value) => sum + value, 0),
  };
}

export function Calendar({
  locale,
  years = demoYears,
  selected,
  onSelect,
  showDetail = false,
}: {
  locale: Locale;
  years?: readonly number[];
  selected: MonthSelection | null;
  onSelect: (selection: MonthSelection) => void;
  showDetail?: boolean;
}) {
  const t = dictionaries[locale];
  const orderedYears = [...years].sort((a, b) => b - a);

  return (
    <section className="card calendar-card" aria-labelledby="calendar-title">
      <div className="card-head">
        <div>
          <p className="eyebrow">{t.demo}</p>
          <h2 id="calendar-title">{t.calendarTitle}</h2>
          <p className="card-subtitle">{t.calendarSubtitle}</p>
        </div>
        <span className="card-icon" aria-hidden="true">
          <Icon name="calendar" size={21} />
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
            {orderedYears.map((year) => (
              <tr key={year}>
                <th scope="row">{year}</th>
                {t.months.map((month, index) => {
                  const selection = createMonthSelection(year, index);
                  const level = selection.level;
                  return (
                    <td key={month}>
                      <button
                        type="button"
                        className={`heat level-${level}`}
                        aria-label={`${month} ${year}: ${t.levels[level]}`}
                        aria-pressed={
                          selected?.year === year && selected.month === index
                        }
                        onClick={() => onSelect(selection)}
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
      {showDetail && (
        <div className="month-detail" aria-live="polite">
          {selected ? (
            <>
              <p className="eyebrow">{t.detail}</p>
              <h3>
                {t.months[selected.month]} {selected.year}
              </h3>
              <p>{t.levels[selected.level]}</p>
              <p>{t.detailNote}</p>
            </>
          ) : (
            <p>{t.select}</p>
          )}
        </div>
      )}
    </section>
  );
}
