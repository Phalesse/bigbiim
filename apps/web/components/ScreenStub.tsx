import WorkspaceScreen from '@/components/WorkspaceScreen';

type Props = {
  code: string;
  name: string;
  actors: string;
  priority: string;
  description: string;
  file: string;
};

/** Compatibilité avec les anciennes pages ; le contenu est désormais une vraie vue API. */
export default function ScreenStub({ code, name, description }: Props) {
  return <WorkspaceScreen code={code} name={name} description={description} />;
}
