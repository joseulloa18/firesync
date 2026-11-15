"use client";
import { Icon } from "./icon";
import { dictionaries, type Locale } from "./messages";
import type {
  HistoryMonthSelection,
  HistoryMonthSummary,
} from "@/lib/history/demo-history";

export type { HistoryMonthSelection };

function summaryKey(year: number, month: number) {
  return `${year}-${month}`;
}

export function Calendar({
  locale,
  years,
  summaries,
  selected,
  onSelect,
  showDetail = false,
  subtitle,
}: {
  locale: Locale;
  years: readonly number[];
  /** Resúmenes puros de `src/lib/history/demo-history.ts`. */
  summaries: readonly HistoryMonthSummary[];
  selected: HistoryMonthSelection | null;
  onSelect: (selection: HistoryMonthSelection) => void;
  showDetail?: boolean;
  subtitle?: string;
}) {
  const t = dictionaries[locale];
  // Filas de año más reciente a más antiguo; los selectores de año, en cambio,
  // muestran 2000 primero (ver dashboard).
  const orderedYears = [...years].sort((a, b) => b - a);
  const summaryByKey = new Map(
    summaries.map((summary) => [
      summaryKey(summary.year, summary.month),
      summary,
    ]),
  );
  const selectedSummary = selected
    ? summaryByKey.get(summaryKey(selected.year, selected.month))
    : undefined;

  return (
    <section className="card calendar-card" aria-labelledby="calendar-title">
      <div className="card-head">
        <div>
          <p className="eyebrow">{t.demo}</p>
          <h2 id="calendar-title">{t.calendarTitle}</h2>
          <p className="card-subtitle">{subtitle ?? t.calendarSubtitle}</p>
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
                  const summary = summaryByKey.get(summaryKey(year, index));
                  if (!summary) {
                    return (
                      <td key={month}>
                        <span className="heat is-empty" aria-hidden="true">
                          ·
                        </span>
                      </td>
                    );
                  }
                  const isSelected =
                    selected?.year === year && selected.month === index;
                  const label = summary.future
                    ? `${month} ${year}: ${t.monthFuture}`
                    : `${month} ${year}: ${t.levels[summary.level]}`;
                  return (
                    <td key={month}>
                      <button
                        type="button"
                        className={`heat level-${summary.level}${
                          summary.future ? " is-future" : ""
                        }${summary.partial ? " is-partial" : ""}`}
                        aria-label={label}
                        aria-pressed={isSelected}
                        title={
                          summary.future
                            ? t.monthFuture
                            : `${t.monthTotal}: ${summary.total}`
                        }
                        disabled={summary.future}
                        onClick={() => onSelect({ year, month: index })}
                      >
                        <span aria-hidden="true">
                          {summary.future
                            ? "×"
                            : ["·", "−", "+", "◆"][summary.level]}
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
          <i className="level-future" />
        </div>
        <span>{t.more}</span>
      </div>
      <p className="helper history-future-note">
        <span className="legend-future" aria-hidden="true">
          ×
        </span>{" "}
        {t.monthFuture}
      </p>
      {showDetail && (
        <div className="month-detail" aria-live="polite">
          {selectedSummary ? (
            <>
              <p className="eyebrow">{t.detail}</p>
              <h3>
                {t.months[selectedSummary.month]} {selectedSummary.year}
              </h3>
              <p>{t.levels[selectedSummary.level]}</p>
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
