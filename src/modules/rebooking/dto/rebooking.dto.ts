import { IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class RebookingOverviewQueryDto {
  @IsOptional()
  @IsString()
  date?: string;
}

export class GenerateRebookingMessageDto {
  @IsString()
  date!: string;

  @IsString()
  startTime!: string;

  @IsString()
  endTime!: string;

  @IsArray()
  @IsUUID('4', { each: true })
  clientIds!: string[];

  @IsOptional()
  @IsIn(['soft', 'friendly'])
  tone?: 'soft' | 'friendly';
}

export class SendRebookingCampaignDto extends GenerateRebookingMessageDto {
  @IsString()
  @MaxLength(2000)
  message!: string;
}
