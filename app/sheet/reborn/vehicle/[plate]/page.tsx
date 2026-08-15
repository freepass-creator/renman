import VehicleRecord from './VehicleRecord';

type Props = {
  params: Promise<{ plate: string }>;
  searchParams: Promise<{ company?: string }>;
};

export default async function RebornVehiclePage({ params, searchParams }: Props) {
  const [{ plate }, { company }] = await Promise.all([params, searchParams]);
  return <VehicleRecord plate={decodeURIComponent(plate)} companyId={company || ''} />;
}
