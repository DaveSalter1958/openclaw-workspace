"use client";

import projectOptions from '@/data/task-project-options.json';

type ProjectOption = {
  value: string;
  label: string;
  year: number | null;
  jobNumber?: string;
};

type ProjectSelectProps = {
  value: string;
  onChange: (value: string) => void;
};

const options = projectOptions as ProjectOption[];
const personalOption = options.find((option) => option.value === 'Personal') ?? { value: 'Personal', label: 'Personal', year: null };
const adminOption = options.find((option) => option.value === 'Admin') ?? { value: 'Admin', label: 'Admin', year: null };

function projectSortValue(option: ProjectOption) {
  const number = option.jobNumber || option.value.match(/^20\d{2}-(\d+[A-Za-z]?)/)?.[1] || '';
  const match = number.match(/^(\d+)([A-Za-z]?)$/);
  return {
    year: option.year ?? 0,
    number: match ? Number(match[1]) : 0,
    suffix: match ? match[2] : '',
    label: option.label,
  };
}

const drsOptions = options
  .filter((option) => option.year !== null)
  .sort((a, b) => {
    const left = projectSortValue(a);
    const right = projectSortValue(b);
    return right.year - left.year || right.number - left.number || right.suffix.localeCompare(left.suffix) || right.label.localeCompare(left.label);
  });
const years = Array.from(new Set(drsOptions.map((option) => option.year))).sort((a, b) => Number(b) - Number(a));

export function ProjectSelect({ value, onChange }: ProjectSelectProps) {
  const hasCustomValue = value && !options.some((option) => option.value === value);

  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No reference</option>
      <option value={adminOption.value}>{adminOption.label}</option>
      <option value={personalOption.value}>{personalOption.label}</option>
      {hasCustomValue ? <option value={value}>{value}</option> : null}
      {years.map((year) => (
        <optgroup key={year} label={`${year} DRS Engineering projects / preliminaries`}>
          {drsOptions.filter((option) => option.year === year).map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
