export type ViewportDevice = 'desktop' | 'tablet' | 'mobile';

export type ResponsiveScope = 'all' | 'mobile' | 'tablet';

export type WorkScope = 'all' | 'content' | 'design';

export interface OpticalOffset {
  x: number;
  y: number;
}

export interface ElementStyles {
  fontSize?: string;
  fontWeight?: string;
  color?: string;
  backgroundColor?: string;
  padding?: string;
  margin?: string;
  marginTop?: string;
  marginBottom?: string;
  borderRadius?: string;
  borderWidth?: string;
  borderColor?: string;
  border?: string;
  borderTop?: string;
  borderBottom?: string;
  textAlign?: 'left' | 'center' | 'right';
  maxWidth?: string;
  width?: string;
  height?: string;
  minHeight?: string;
  display?: string;
  flexDirection?: 'row' | 'column';
  gap?: string;
  alignItems?: string;
  justifyContent?: string;
  gridTemplateColumns?: string;
  opacity?: number;
  boxShadow?: string;
  overflow?: string;
  letterSpacing?: string;
  lineHeight?: string;
  objectFit?: any;
  position?: any;
  flex?: any;
  alignSelf?: string;
  whiteSpace?: string;
  [key: string]: any;
}

export interface NodeElement {
  id: string;
  name: string;
  tag: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span' | 'button' | 'a' | 'img' | 'div' | 'section' | 'header' | 'footer' | 'nav' | 'form' | 'input' | 'textarea';
  type: 'heading' | 'text' | 'button' | 'image' | 'section' | 'container' | 'card' | 'grid' | 'form' | 'nav' | 'badge' | 'input' | 'textarea';
  content?: string;
  src?: string;
  alt?: string;
  href?: string;
  tokenRef?: string; // e.g. "buttonPrimary"
  styles: ElementStyles;
  responsiveOverrides?: {
    mobile?: Partial<ElementStyles>;
    tablet?: Partial<ElementStyles>;
  };
  opticalOffset?: OpticalOffset;
  children?: NodeElement[];
  isLocked?: boolean;
}

export interface DesignTokens {
  primaryColor: string;
  accentCopper: string;
  surfaceColor: string;
  textColor: string;
  fontFamily: string;
  buttonRadius: string;
  buttonVariant: 'fill' | 'outline' | 'soft';
}

export interface PageDocument {
  id: string;
  name: string;
  slug: string;
  title: string;
  description: string;
  root: NodeElement;
}

export interface DirectionOption {
  id: string;
  name: string;
  subtitle: string;
  concept: string;
  typography: string;
  atmosphere: string;
  colorPalette: {
    primary: string;
    copper: string;
    surface: string;
    text: string;
  };
  subpagesPlan: string[];
  pages: Record<string, PageDocument>;
}

export interface ProjectAssumption {
  id: string;
  category: 'cel' | 'odbiorcy' | 'charakter' | 'materialy' | 'braki';
  label: string;
  value: string;
}

export interface ProposalComment {
  id: string;
  elementId: string;
  elementName: string;
  author: string;
  text: string;
  createdAt: string;
  resolved: boolean;
}

export interface ProposalSnapshot {
  id: string;
  createdAt: string;
  title: string;
  directionId: string;
  directionName: string;
  commentsCount: number;
  snapshotData: {
    pages: Record<string, PageDocument>;
    tokens: DesignTokens;
  };
}

export interface PublishingCheckItem {
  id: string;
  title: string;
  category: 'content' | 'links' | 'forms' | 'accessibility' | 'layout';
  status: 'passed' | 'warning' | 'error';
  description: string;
  elementId?: string;
  pageSlug?: string;
  fixAction?: string;
}

export interface ProjectState {
  id: string;
  name: string;
  client: string;
  lastUpdated: string;
  assumptions: ProjectAssumption[];
  activeDirectionId: string;
  directions: Record<string, DirectionOption>;
  activePageSlug: string;
  tokens: DesignTokens;
  comments: ProposalComment[];
  snapshots: ProposalSnapshot[];
  isPublished?: boolean;
  publishedUrl?: string;
}
